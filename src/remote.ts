/**
 * Host receiver for the client's RPCs (`remote.looklook`):
 * - `listModels` — probe an OpenAI-compatible `/models` endpoint with the
 *   provider's stored credential, so the settings page can verify an API key
 *   and offer the model list without a separate "test connection" step;
 * - `upload` — save one dropped file into the session `.uploads/` (the
 *   "file channel": images never touch the native attachment pipeline, so
 *   api-proxy's model-modality check is never triggered);
 * - `asrStatus` / `asrInstall` — local ASR one-click install state/trigger;
 * - `sessionModality` — report whether the session's current model accepts
 *   image input, so the client can route a dropped image to the native
 *   pipeline (multi-modal model) or to the file channel (text-only model).
 *
 * All methods are Remote (Typert) calls, so they ride the authorized
 * api-proxy connection — no unauth'd HTTP routes are exposed.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { saveUpload, MAX_UPLOAD_BYTES, safeFileName, UPLOADS_DIR } from './upload.ts'
import {
  localAsrReady,
  performInstall,
  readReadyMarker,
  currentInstallPhase,
  currentInstallError,
  LOCAL_ASR_MODEL,
  type AsrInstallPhase,
} from './asr-install.ts'

/** One model-discovery outcome, returned over the wire as lossless JSON. */
export type LooklookListModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string }

/** One upload outcome. */
export type LooklookUploadResult =
  | { ok: true; path: string; name: string; size: number }
  | { ok: false; error: string }

/** Local ASR install status. */
export interface LooklookAsrStatus {
  installed: boolean
  phase: AsrInstallPhase
  model: string
  error: string | null
}

/** Session modality probe outcome. */
export type LooklookModalityResult =
  | { ok: true; supportsImage: boolean }
  | { ok: false; error: string }

/** Credential-bearing fetch: fail before following any redirect. */
const FETCH_REDIRECT = 'error' as const

/**
 * Host service answering `remote.looklook.*`. Extends
 * `TypertRemoteService` so the gateway's source-mode discovery sees the
 * binding (`ctx.looklookRemote` ← wire namespace `looklook`); the client
 * mounts the matching descriptor.
 */
export class LooklookRemoteService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'looklookRemote', { namespace: 'looklook' })
  }

  /**
   * Probe one provider's `/models` endpoint. Uses the just-typed key when the
   * caller passes one (the settings editor has not saved yet); otherwise reads
   * the stored credential for the reference.
   * @param provider - the provider's endpoint, credential reference, and an
   *   optional just-typed key that takes precedence over storage.
   * @returns the model id list, or a classified failure.
   */
  @Remote
  async listModels(provider: {
    baseURL: string
    apiKeyEnv: string
    apiKey?: string
  }): Promise<LooklookListModelsResult> {
    let key = provider.apiKey
    if (key === undefined || key.length === 0) {
      const credentials = this.ctx.get('credentials')
      key = credentials === undefined
        ? undefined
        : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value
    }
    if (key === undefined || key.length === 0) {
      return { ok: false, error: '请先填写 API Key' }
    }
    try {
      const url = `${provider.baseURL.trim().replace(/\/+$/, '')}/models`
      const response = await fetch(url, {
        redirect: FETCH_REDIRECT,
        // Fresh per call: an AbortSignal.timeout starts ticking at creation.
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${key}` },
      })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      const payload = await response.json() as { data?: Array<{ id?: string }> }
      const models = (payload.data ?? [])
        .map(item => item.id)
        .filter((id): id is string => typeof id === 'string')
      return { ok: true, models }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Save one dropped file into the session workspace `.uploads/`. Images,
   * archives, and videos all ride this channel; the returned path is what the
   * model sees. Authorized by the connection, size-capped, path-safe.
   */
  @Remote
  async upload(payload: {
    sessionId: string
    name: string
    /** Base64-encoded file bytes. */
    data: string
  }): Promise<LooklookUploadResult> {
    try {
      const result = await saveUpload(this.ctx, payload.sessionId, payload.name, payload.data)
      return { ok: true, ...result }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Report the local ASR install state (ready marker + in-memory phase). */
  @Remote
  async asrStatus(): Promise<LooklookAsrStatus> {
    const installed = await localAsrReady()
    return {
      installed,
      phase: installed ? 'done' : currentInstallPhase(),
      model: LOCAL_ASR_MODEL,
      error: currentInstallError(),
    }
  }

  /**
   * Trigger the local ASR install (idempotent). Returns the current phase
   * after starting or acknowledging; the client polls asrStatus for progress.
   */
  @Remote
  async asrInstall(): Promise<{ ok: true; phase: AsrInstallPhase; already: boolean } | { ok: false; error: string }> {
    try {
      const outcome = await startInstallIfNeeded()
      return { ok: true, ...outcome }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Report whether the session's current model accepts image input, by
   * resolving the session's last request header route. Used by the client to
   * decide between the native image pipeline and the file channel.
   */
  @Remote
  async sessionModality(sessionId: string): Promise<LooklookModalityResult> {
    try {
      const sessions = this.ctx.get('sessions') as {
        get(id: string): {
          requestHeader(): { config?: { provider?: string; model?: string } } | undefined
        } | undefined
      } | undefined
      if (sessions === undefined) return { ok: false, error: 'sessions 服务不可用' }
      const session = sessions.get(sessionId)
      if (session === undefined) return { ok: false, error: 'session not found' }
      const header = session.requestHeader()
      const provider = header?.config?.provider
      const model = header?.config?.model
      if (provider === undefined || model === undefined) return { ok: false, error: '会话尚未建立模型路由' }
      const info = await this.ctx.llm.resolveModelInfo(provider, model)
      // Undefined inputModalities = endpoint does not declare modality; the
      // native api-proxy treats it as image-capable (its refusal only fires
      // when explicitly declared without image), so mirror that here.
      return { ok: true, supportsImage: info.inputModalities === undefined || info.inputModalities.includes('image') }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Read one uploaded file's bytes back from the session `.uploads/` (the
   * client renders thumbnails / lightbox for image files through this RPC).
   * Restricted: basename only, must exist under `.uploads/`, image types
   * only, size-capped — a read-only file channel, no arbitrary paths.
   */
  @Remote
  async readUpload(payload: {
    sessionId: string
    name: string
  }): Promise<{ ok: true; mediaType: string; data: string } | { ok: false; error: string }> {
    try {
      const sessions = this.ctx.get('sessions') as {
        get(id: string): { header: { cwd?: string } } | undefined
      } | undefined
      if (sessions === undefined) return { ok: false, error: 'sessions 服务不可用' }
      const session = sessions.get(payload.sessionId)
      const cwd = session?.header.cwd
      if (cwd === undefined) return { ok: false, error: 'session not found or has no workspace' }
      const uploadDir = join(cwd, UPLOADS_DIR)
      const name = safeFileName(payload.name)
      const target = resolve(uploadDir, name)
      // Guards: target must be strictly inside uploadDir (basename-only names
      // already rule out traversal; this is defense in depth).
      const resolvedUploadDir = resolve(uploadDir)
      if (target !== resolvedUploadDir && !target.startsWith(resolvedUploadDir + sep)) {
        return { ok: false, error: 'invalid file target' }
      }
      // Stat first so an oversized image is rejected without loading it into
      // memory (the 100MB upload cap would otherwise create a transient spike).
      const { stat } = await import('node:fs/promises')
      const info = await stat(target)
      if (!info.isFile()) return { ok: false, error: 'not a file' }
      if (info.size > 32 * 1024 * 1024) return { ok: false, error: '图片超过 32MB 上限' }
      const data = await readFile(target)
      const mediaType = mediaTypeOfUpload(name)
      if (mediaType === undefined) return { ok: false, error: 'not an image file' }
      return { ok: true, mediaType, data: data.toString('base64') }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/** Map an upload file name to an image media type (or undefined). */
function mediaTypeOfUpload(name: string): string | undefined {
  const dot = name.toLowerCase().lastIndexOf('.')
  const ext = dot >= 0 ? name.toLowerCase().slice(dot) : ''
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.bmp': return 'image/bmp'
    case '.avif': return 'image/avif'
    default: return undefined
  }
}

// ── ASR install trigger (single installer at a time; state lives in asr-install.ts) ──

/** Start the install if not already running; returns (phase, already). */
async function startInstallIfNeeded(): Promise<{ phase: AsrInstallPhase; already: boolean }> {
  if (currentInstallPhase() === 'done' || (await localAsrReady())) {
    return { phase: 'done', already: true }
  }
  if (currentInstallPhase() !== 'none' && currentInstallPhase() !== 'failed') {
    return { phase: currentInstallPhase(), already: true }
  }
  void performInstall()
  return { phase: 'checking', already: false }
}

export { MAX_UPLOAD_BYTES, readReadyMarker }
