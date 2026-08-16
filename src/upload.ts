/**
 * dsh-looklook/upload — host-side upload support.
 *
 * POST /api/looklook-upload — save one uploaded file into the session's
 * workspace `.uploads/` directory (500 MB cap). Returns the absolute path so
 * the client can tell the model where the file landed.
 *
 * The channel accepts ANY extension — installing the plugin unlocks every
 * file type for upload (images still ride the native DSH pipeline; the
 * client filters which drops reach this route).
 *
 * A standard webServer route (registered like any other `/api` route), so
 * no DSH source is modified.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Upload cap: 500 MB for every file type. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024

/** Archive extensions (used for classification/hints, not a whitelist). */
export const ARCHIVE_EXTENSIONS = ['.zip', '.7z'] as const

/** Video extensions (used for classification/hints, not a whitelist). */
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'] as const

/** Every extension the upload channel can accept (archives + video). */
export const ALL_EXTENSIONS: readonly string[] = [...ARCHIVE_EXTENSIONS, ...VIDEO_EXTENSIONS]

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

/** Whether the extension is an archive (classification only). */
export function isArchiveName(name: string): boolean {
  return (ARCHIVE_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

/** Whether the extension is a video (classification only). */
export function isVideoName(name: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extname(name).toLowerCase())
}

// ── Route registration ──

export interface UploadRequest {
  sessionId: string
  name: string
  /** Base64-encoded file bytes. */
  data: string
}

/**
 * Register the upload route on the webServer service.
 * @param ctx - host context (injects webServer + sessions).
 */
export function registerUploadRoutes(ctx: Context): void {
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

        // Every extension is accepted (installing the plugin unlocks all
        // uploads; images ride the native DSH pipeline instead).

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

}
