/**
 * dsh-looklook/upload — host-side upload support.
 *
 * - POST /api/looklook-upload — save one uploaded file into the session's
 *   workspace `.uploads/` directory (500 MB cap, extension whitelist:
 *   archives + video). Returns the absolute path so the client can tell the
 *   model where the file landed.
 * - GET  /api/looklook-7z-status — whether the 7z CLI is installed.
 * - POST /api/looklook-7z-install — install p7zip-full via apt (user-triggered
 *   from the plugin settings page).
 *
 * These are standard webServer routes (registered like any other `/api`
 * route), so no DSH source is modified.
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { LooklookScope } from './settings.ts'
import { looklookFeatures } from './settings.ts'

/** Upload cap: 500 MB for every file type. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** Archive extensions accepted by the upload channel. */
export const ARCHIVE_EXTENSIONS = ['.zip', '.7z'] as const

/** Video extensions accepted by the upload channel. */
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'] as const

/** Subdirectory (inside the session workspace) where uploads are stored. */
export const UPLOADS_DIR = '.uploads'

// ── HTTP helpers ──

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(text)
}

/** Read the full request body as a string, with a hard byte ceiling. */
function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limit) {
        rejectBody(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', rejectBody)
  })
}

/** Basename-only, filesystem-safe file name (rejects path tricks and empties). */
function safeFileName(name: string): string {
  const base = basename(String(name ?? '')).trim()
  if (base === '' || base === '.' || base === '..') throw new Error('invalid file name')
  if (/[/\\\0]/.test(base)) throw new Error('invalid file name')
  return base
}

/** Whether the extension is on the archive whitelist. */
export function isArchiveName(name: string): boolean {
  return (ARCHIVE_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/** Whether the extension is on the video whitelist. */
export function isVideoName(name: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/** The base extension set (always allowed): .zip only. */
const BASE_EXTENSIONS = ['.zip'] as const

/** Whether the name passes the extension whitelist for the given policy. */
export function isAllowedUploadName(name: string, moreExtensions: boolean): boolean {
  const ext = extname(name).toLowerCase()
  if (moreExtensions) {
    return isArchiveName(name) || isVideoName(name)
  }
  return (BASE_EXTENSIONS as readonly string[]).includes(ext)
}

// ── 7z helpers ──

/** Whether the 7z CLI is available on PATH. */
export function is7zInstalled(): Promise<boolean> {
  return new Promise((done) => {
    spawn('7z', ['i'], { stdio: 'ignore' })
      .on('error', () => done(false))
      .on('exit', (code) => done(code === 0))
  })
}

/** Install p7zip-full via apt (best effort). */
export function install7z(): Promise<{ ok: boolean; output: string }> {
  return new Promise((done) => {
    const child = spawn('apt-get', ['install', '-y', '-qq', 'p7zip-full'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('error', (error) => done({ ok: false, output: String(error.message) }))
    child.on('exit', (code) => done({ ok: code === 0, output: output.slice(0, 2000) }))
  })
}

// ── Route registration ──

export interface UploadRequest {
  sessionId: string
  name: string
  /** Base64-encoded file bytes. */
  data: string
}

/**
 * Register the upload + 7z routes on the webServer service.
 * @param ctx - host context (injects webServer + sessions).
 */
export function registerUploadRoutes(ctx: Context, features: LooklookScope): void {
  const webServer = ctx.get('webServer') as {
    register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  }

  webServer.register({
    kind: 'exact',
    path: '/api/looklook-upload',
    handler: async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
      try {
        const raw = await readBody(req, MAX_UPLOAD_BYTES * 1.5 + 1024)
        const parsed = JSON.parse(raw) as Partial<UploadRequest>
        const name = safeFileName(String(parsed.name ?? ''))
        const sessionId = String(parsed.sessionId ?? '')
        const data = String(parsed.data ?? '')
        if (sessionId === '') throw new Error('missing sessionId')
        if (data === '') throw new Error('missing file data')

        // Extension whitelist, governed by the `moreExtensions` switch:
        // off = .zip only; on = archives (.zip/.7z) + video.
        if (!isAllowedUploadName(name, looklookFeatures(features).moreExtensions)) {
          throw new Error(`unsupported file type "${extname(name)}"; enable "支持更多扩展名" for .7z/video uploads`)
        }

        // Decode and enforce the 500 MB cap on the decoded bytes.
        const bytes = Buffer.from(data, 'base64')
        if (bytes.length > MAX_UPLOAD_BYTES) {
          throw new Error(`file exceeds the 500 MB upload limit (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`)
        }

        // Resolve the session's workspace (cwd).
        const sessions = ctx.get('sessions') as {
          get(id: SessionId): { header: { cwd?: string } } | undefined
        }
        const session = sessions.get(sessionId as SessionId)
        const cwd = session?.header.cwd
        if (cwd === undefined) {
          throw new Error(`session not found or has no workspace: ${sessionId}`)
        }

        const uploadDir = join(cwd, UPLOADS_DIR)
        await mkdir(uploadDir, { recursive: true })
        const target = resolve(uploadDir, name)
        await writeFile(target, bytes)

        sendJson(res, 200, { ok: true, path: target, name, size: bytes.length })
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  webServer.register({
    kind: 'exact',
    path: '/api/looklook-7z-status',
    handler: async (_req, res) => {
      const installed = await is7zInstalled()
      sendJson(res, 200, { ok: true, installed })
    },
  })

  webServer.register({
    kind: 'exact',
    path: '/api/looklook-7z-install',
    handler: async (req, res) => {
      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' })
      try {
        const result = await install7z()
        const installed = await is7zInstalled()
        sendJson(res, 200, { ok: result.ok && installed, installed, output: result.output })
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  })
}
