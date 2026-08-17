/**
 * dsh-looklook/video — the `looklook_see` video branch: understand a video, whether
 * it was uploaded as a local file (session `.uploads/`) or referenced by a
 * URL (Bilibili / YouTube / Douyin / generic via the vendored Python worker).
 *
 * Pipeline (all text flows to the text-only main model):
 *   1. vendor worker.py extracts metadata + transcript (platform/embedded
 *      subtitles first; else it prepares an audio file) + frames.
 *   2. Audio understanding (L2+L3 merged, capability-probed, no user label):
 *      - if an audio API provider is configured, try the HIGH route first
 *        (chat/completions + input_audio → transcript + tone + music + pace
 *        in one call); on a format rejection fall back to the LOW route
 *        (/v1/audio/transcriptions → transcript only). The probed capability
 *        is remembered per provider to avoid repeating the failed attempt.
 *      - else, if the local ASR install exists, use it (transcript only).
 *      - else, no audio understanding (subtitles only).
 *   3. Frames are described by the vision model (each frame, structured
 *      prompt) and returned as a "画面时间线" so the main model sees what
 *      happened visually instead of bare image paths.
 *
 * All external calls are subprocesses of the vendored worker or direct HTTP;
 * missing dependencies surface as classified messages instead of a crash.
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { AudioProviderConfig, AudioScope, VisionScope } from './settings.ts'
import { enabledAudioProviders, enabledProviders } from './settings.ts'
import { chatCompletionsUrl } from './vision-client.ts'
import { detectPython } from './python-env.ts'

/** The vendored worker's directory (scripts/video-worker next to this file). */
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'video-worker')

/**
 * Shared scratch directory for frames/WAVs: the OS temp dir, NOT inside the
 * plugin package or node_modules (a reinstall would wipe it mid-use, and
 * running inside node_modules is a packaging smell). Keyed by this package so
 * concurrent DSH profiles do not collide.
 */
const TMP_DIR = join(tmpdir(), 'dsh-looklook')

/** The local ASR install root: $DSH_HOME/looklook-asr (same formula as
 * asr-install.ts) — machine-local state outside node_modules. */
const ASR_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'looklook-asr')
/** The plugin's isolated Python venv (created by the ASR installer). */
const VENV_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'looklook-venv')
/** The venv's python executable (POSIX bin/python, Windows Scripts/python.exe). */
const VENV_PYTHON = process.platform === 'win32'
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python')
/** The local ASR install marker file (set by the one-click installer). */
const LOCAL_ASR_MARKER = join(ASR_DIR, 'ready')
/** The local ASR transcribe script (written by the installer). */
const LOCAL_ASR_SCRIPT = join(ASR_DIR, 'transcribe.py')

/** Worker stdout JSON (the stable contract with worker.py). */
interface WorkerOutput {
  ok: boolean
  error?: string
  warnings?: string[]
  meta?: Record<string, unknown>
  transcript?: {
    source?: string
    language?: string
    text?: string
    segments?: Array<{ start: number; end: number; text: string }> | null
  } | null
  frames?: Array<{ time: number; path: string }>
  video_path?: string
  audio_path?: string
}

/** One audio-understanding slice result. */
interface AudioUnderstanding {
  ok: boolean
  /** Whether the HIGH route (transcript + tone/music) was used. */
  high?: boolean
  /** Slice time range (seconds). */
  start?: number
  end?: number
  text?: string
  error?: string
}

/** Probed capability of one audio provider. */
type AudioCapability = 'unknown' | 'high' | 'low'

/** Per-provider probed capability (keyed by baseURL+model). */
const audioCapabilityCache = new Map<string, AudioCapability>()

/** Structured prompt for describing one video frame (vision model). */
const FRAME_PROMPT = '这是一段视频中的一帧画面。请描述：1) 整体场景与氛围 2) 主要人物/主体及其外貌、表情、动作 3) 画面中的文字或标识 4) 艺术风格 5) 光线与色彩。逐项回答，尽量具体，只说画面中真实可见的内容。'

/**
 * Run the vendored Python worker as a subprocess.
 * @param source - local file path or video URL.
 * @param opts - worker options (frames, lang, proxy).
 * @returns the parsed worker JSON.
 */
/**
 * Resolve the python executable for the video worker. Prefers the plugin's
 * ISOLATED venv (where yt-dlp lives) when it exists; falls back to a system
 * python otherwise (worker.py still works for subtitle/frame extraction, but
 * URL downloads need yt-dlp).
 */
async function resolveWorkerPython(): Promise<{ ok: boolean; command?: string; error?: string }> {
  // Venv exists?
  try {
    const { access } = await import('node:fs/promises')
    await access(VENV_PYTHON)
    return { ok: true, command: VENV_PYTHON }
  } catch {
    // No venv — fall back to system python detection.
    const pyEnv = await detectPython()
    if (!pyEnv.ok || pyEnv.command === undefined) return { ok: false, error: pyEnv.error }
    return { ok: true, command: pyEnv.command }
  }
}

function runWorker(
  source: string,
  opts: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs = 600_000,
): Promise<WorkerOutput> {
  return new Promise((resolveBody, rejectBody) => {
    // Per-call scratch subdir so concurrent videos never collide on the
    // worker's fixed frame/file names (P1: cross-session frame theft).
    const callDir = join(TMP_DIR, `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)
    void mkdir(callDir, { recursive: true }).catch(() => {})
    void resolveWorkerPython().then((pyEnv) => {
      if (!pyEnv.ok || pyEnv.command === undefined) {
        rejectBody(new Error(pyEnv.error ?? '未找到可用的 Python 运行时'))
        return
      }
      const pythonCmd: string = pyEnv.command
      const args = ['worker.py', source, callDir, JSON.stringify(opts)]
      const child = spawn(pythonCmd, args, {
        cwd: WORKER_DIR,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, import('node:stream').Readable>
      attachWorkerListeners(child, callDir, stdoutAccumulator(), signal, timeoutMs)
        .then(resolveBody, rejectBody)
    }).catch(rejectBody)
  })
}

/** Accumulate child stdout. */
function stdoutAccumulator(): { buffer: string; push: (chunk: Buffer) => void; get: () => string } {
  let stdout = ''
  return {
    buffer: stdout,
    push: (chunk: Buffer) => { stdout += chunk.toString('utf8') },
    get: () => stdout,
  }
}

/**
 * Parse worker JSON defensively. The worker keeps stdout clean, but older
 * yt-dlp versions or third-party extractors may leak progress lines there.
 * Scan balanced JSON objects and use the last valid result document.
 */
function parseWorkerOutput(raw: string): WorkerOutput {
  const text = raw.trim()
  try {
    return JSON.parse(text) as WorkerOutput
  } catch {
    // Recover from legacy/noisy stdout below.
  }
  let start = -1
  let depth = 0
  let quoted = false
  let escaped = false
  let last: WorkerOutput | undefined
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (ch === '\\\\') escaped = true
      else if (ch === '\"') quoted = false
      continue
    }
    if (ch === '\"') {
      quoted = true
      continue
    }
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try {
          const candidate = JSON.parse(raw.slice(start, i + 1)) as WorkerOutput
          if (candidate !== null && typeof candidate === 'object' && typeof candidate.ok === 'boolean') last = candidate
        } catch {
          // Ignore malformed fragments and keep scanning.
        }
        start = -1
      }
    }
  }
  if (last !== undefined) return last
  throw new Error('worker stdout did not contain a valid result JSON document')
}

/**
 * Wire the worker child's stdout/stderr/close/error and the abort/timeout
 * handling, resolving with the parsed WorkerOutput. Broken out of runWorker
 * so the Python-runtime probe can stay asynchronous.
 */
function attachWorkerListeners(
  child: import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, import('node:stream').Readable>,
  callDir: string,
  acc: ReturnType<typeof stdoutAccumulator>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<WorkerOutput> {
  return new Promise((resolveBody, rejectBody) => {
    let stderr = ''
    let settled = false
    // Best-effort scratch cleanup on settle (success, failure, timeout, abort).
    const cleanupScratch = (): void => {
      void import('node:fs/promises').then(fs => fs.rm(callDir, { recursive: true, force: true })).catch(() => {})
    }
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanupScratch()
      child.kill('SIGKILL')
      rejectBody(new Error(`视频分析超时（${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)
    const onAbort = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanupScratch()
      child.kill('SIGKILL')
      rejectBody(new Error('视频分析已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => { acc.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      rejectBody(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      if (code !== 0) {
        rejectBody(new Error(stderr.trim().slice(-400) || `worker exited ${code}`))
        return
      }
      try {
        resolveBody(parseWorkerOutput(acc.get()))
      } catch (error) {
        const stdoutTail = acc.get().trim().slice(-300)
        const stderrTail = stderr.trim().slice(-300)
        const detail = [error instanceof Error ? error.message : String(error), stdoutTail ? `stdout: ${stdoutTail}` : '', stderrTail ? `stderr: ${stderrTail}` : ''].filter(Boolean).join('；')
        rejectBody(new Error(`无法解析视频分析结果：${detail}`))
      }
    })
  })
}

/**
 * Extract an audio slice as 16 kHz mono WAV for the audio model.
 * @param videoPath - the video/audio file.
 * @param signal - abort signal.
 * @param start - start seconds (default 0).
 * @param end - end seconds (default: 60s cap).
 * @returns the temp WAV path (caller owns cleanup).
 */
async function sampleAudio(videoPath: string, signal: AbortSignal, start = 0, end?: number): Promise<string> {
  const tmpDir = TMP_DIR
  await mkdir(tmpDir, { recursive: true })
  // Unique file name per slice so concurrent videos never collide.
  const wav = join(tmpDir, `audio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.wav`)
  const args = ['-y', '-i', videoPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1']
  if (start > 0) args.splice(1, 0, '-ss', String(start))
  if (end !== undefined) args.push('-t', String(end - start))
  args.push(wav)
  await runFfmpeg(args, signal)
  return wav
}

/** Delete one temp WAV (best-effort; never throws). */
async function cleanupWav(wavPath: string): Promise<void> {
  try {
    await import('node:fs/promises').then(fs => fs.rm(wavPath, { force: true }))
  } catch {
    /* best-effort cleanup */
  }
}

/**
 * Compute audio-understanding slices. With ASR segments, slices follow the
 * transcript's natural pauses (gap ≥ 2s starts a new slice, at most
 * `maxSlices`). Without segments, slices are fixed 60s blocks so a long
 * video never loads a whole multi-hour WAV into memory (C4 fix): a video of
 * any length becomes at most `maxSlices` capped blocks.
 */
function audioSlicesOf(
  segments: ReadonlyArray<{ start: number; end: number; text: string }> | null | undefined,
  duration: number,
  maxSlices = 4,
): Array<{ start: number; end: number | undefined }> {
  if (duration <= 0) return [{ start: 0, end: undefined }]
  if (segments !== null && segments !== undefined && segments.length > 0) {
    const sorted = [...segments].sort((a, b) => a.start - b.start)
    const first = sorted[0]
    if (first === undefined) return [{ start: 0, end: duration }]
    const slices: Array<{ start: number; end: number | undefined }> = []
    let start = first.start
    let end = first.end
    for (const seg of sorted.slice(1)) {
      const gap = seg.start - end
      // A gap of 2s+ is a natural pause → cut a new slice.
      if (gap >= 2 && slices.length + 1 < maxSlices) {
        slices.push({ start, end })
        start = seg.start
        end = seg.end
      } else {
        end = Math.max(end, seg.end)
      }
    }
    slices.push({ start, end })
    return slices
  }
  // No transcript: fixed 60s blocks, capped.
  const block = 60
  const count = Math.min(Math.max(1, Math.ceil(duration / block)), maxSlices)
  const step = duration / count
  return Array.from({ length: count }, (_, i) => ({
    start: Math.round(i * step * 10) / 10,
    end: i === count - 1 ? duration : Math.round((i + 1) * step * 10) / 10,
  }))
}

/** HIGH route: chat/completions + input_audio (transcript + tone/music/pace). */
async function audioHigh(
  provider: AudioProviderConfig,
  apiKey: string,
  wavPath: string,
  question: string,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; reject: boolean; error: string }> {
  const data = await readFile(wavPath)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), provider.timeoutMs ?? 60_000)
  const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(chatCompletionsUrl(provider.baseURL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: upstream,
      body: JSON.stringify({
        model: provider.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `请听这段视频音频，回答问题：${question}。请同时提供：1) 对白文字（逐句） 2) 说话者的语气/情绪 3) 背景音乐风格与氛围 4) 节奏特点。只输出内容本身。` },
            { type: 'input_audio', input_audio: { data: data.toString('base64'), format: 'wav' } },
          ],
        }],
      }),
    })
    if (response.status === 400 || response.status === 415 || response.status === 422) {
      return { ok: false, reject: true, error: `模型不支持音频输入（HTTP ${response.status}）` }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reject: false, error: `音频模型鉴权失败（HTTP ${response.status}），请检查 API Key` }
    }
    if (response.status === 404) {
      return { ok: false, reject: false, error: `音频模型不存在（HTTP 404），请检查模型名` }
    }
    if (!response.ok) return { ok: false, reject: false, error: `音频理解失败（HTTP ${response.status}）` }
    const text = extractAssistantText(await response.json())
    if (text === '') return { ok: false, reject: true, error: '音频模型返回了空内容' }
    return { ok: true, text }
  } catch (error) {
    if (signal.aborted) return { ok: false, reject: false, error: '已取消' }
    return { ok: false, reject: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

/** LOW route: /v1/audio/transcriptions (transcript only). */
async function audioLow(
  provider: AudioProviderConfig,
  apiKey: string,
  wavPath: string,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; reject: boolean; error: string }> {
  const data = await readFile(wavPath)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), provider.timeoutMs ?? 60_000)
  const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
  try {
    const form = new FormData()
    form.append('file', new Blob([data], { type: 'audio/wav' }), 'audio.wav')
    form.append('model', provider.model)
    const base = provider.baseURL.trim().replace(/\/+$/, '')
    const url = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: upstream,
      body: form,
    })
    if (response.status === 400 || response.status === 415 || response.status === 422) {
      return { ok: false, reject: true, error: `转写端点拒绝请求（HTTP ${response.status}）` }
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reject: false, error: `转写鉴权失败（HTTP ${response.status}）` }
    }
    if (!response.ok) return { ok: false, reject: false, error: `转写失败（HTTP ${response.status}）` }
    const body = await response.json() as { text?: unknown }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (text === '') return { ok: false, reject: true, error: '转写返回了空内容' }
    return { ok: true, text }
  } catch (error) {
    if (signal.aborted) return { ok: false, reject: false, error: '已取消' }
    return { ok: false, reject: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

/** Local ASR (one-click installed) — LOW route only. */
async function audioLocal(
  wavPath: string,
  signal: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  // Run with the ISOLATED venv python (faster-whisper lives there), never the
  // system python. If the venv is missing, the ASR install was not completed.
  const venvPy = VENV_PYTHON
  return new Promise((resolveBody) => {
    const script = LOCAL_ASR_SCRIPT
    const child = spawn(venvPy, [script, wavPath], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as import('node:child_process').ChildProcessByStdio<null, import('node:stream').Readable, import('node:stream').Readable>
    let stdout = ''
    let stderr = ''
    let settled = false
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (code !== 0) {
        resolveBody({ ok: false, error: stderr.trim().slice(-300) || '本地 ASR 失败' })
        return
      }
      const text = stdout.trim()
      resolveBody(text === '' ? { ok: false, error: '本地 ASR 返回空内容' } : { ok: true, text })
    })
    signal.addEventListener('abort', () => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolveBody({ ok: false, error: '已取消' })
    }, { once: true })
  })
}

/**
 * Capability-probed audio understanding per time slice: HIGH first, fall back
 * to LOW only on format rejection; remembers the probe per provider. Slices
 * come from the ASR transcript's natural pauses (or one whole slice when no
 * transcript). Returns [] when no audio path is available or nothing is
 * configured/installed.
 */
async function understandAudio(
  providers: readonly AudioProviderConfig[],
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  audioPath: string,
  question: string,
  signal: AbortSignal,
  slices: ReadonlyArray<{ start: number; end: number | undefined }>,
): Promise<AudioUnderstanding[]> {
  const results: AudioUnderstanding[] = []
  for (const slice of slices) {
    let wavPath: string | undefined
    try {
      wavPath = await sampleAudio(audioPath, signal, slice.start, slice.end)
      let resolved = false
      for (const provider of providers) {
        const key = `${provider.baseURL}|${provider.model}`
        const cached = audioCapabilityCache.get(key) ?? 'unknown'
        const apiKey = await resolveApiKey(provider.apiKeyEnv)
        if (apiKey === undefined) continue
        if (cached !== 'low') {
          const high = await audioHigh(provider, apiKey, wavPath, question, signal)
          if (high.ok) {
            audioCapabilityCache.set(key, 'high')
            results.push({ ok: true, high: true, start: slice.start, end: slice.end, text: high.text })
            resolved = true
            break
          }
          if (high.reject) {
            audioCapabilityCache.set(key, 'low')
          } else {
            results.push({ ok: false, high: cached === 'unknown', start: slice.start, end: slice.end, error: high.error })
            resolved = true
            break
          }
        }
        const low = await audioLow(provider, apiKey, wavPath, signal)
        if (low.ok) {
          audioCapabilityCache.set(key, 'low')
          results.push({ ok: true, high: false, start: slice.start, end: slice.end, text: low.text })
          resolved = true
          break
        }
        if (!low.reject) {
          results.push({ ok: false, high: false, start: slice.start, end: slice.end, error: low.error })
          resolved = true
          break
        }
      }
      if (resolved) continue
      // No usable API provider — try the local one-click ASR install.
      const localOk = await import('node:fs').then(fs => fs.promises.access(LOCAL_ASR_MARKER).then(() => true).catch(() => false))
      if (localOk) {
        const local = await audioLocal(wavPath, signal)
        if (local.ok) {
          results.push({ ok: true, high: false, start: slice.start, end: slice.end, text: local.text })
          continue
        }
      }
      results.push({ ok: false, start: slice.start, end: slice.end, error: '未配置音频模型或本地 ASR' })
    } finally {
      if (wavPath !== undefined) await cleanupWav(wavPath)
    }
  }
  return results
}

/** Run one ffmpeg command (used for audio sampling). */
function runFfmpeg(args: readonly string[], signal: AbortSignal): Promise<void> {
  return new Promise((resolveBody, rejectBody) => {
    const child = spawn('ffmpeg', [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    let settled = false
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', rejectBody)
    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (code === 0) resolveBody()
      else rejectBody(new Error(stderr.trim().slice(-300) || 'ffmpeg failed'))
    })
    signal.addEventListener('abort', () => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectBody(new Error('音频采样已取消'))
    }, { once: true })
  })
}

/**
 * Extract the assistant's answer from a chat-completions response. Some
 * endpoints (e.g. aplan-vl → sensenova-flash-lite) put the answer in
 * `message.reasoning` and leave `content` empty; accept both.
 */
function extractAssistantText(body: unknown): string {
  const choice = (body as { choices?: Array<{ message?: Record<string, unknown> }> })?.choices?.[0]
  const message = choice?.message
  if (message === undefined) return ''
  for (const field of ['content', 'reasoning']) {
    const value = message[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/** Describe one frame with the vision model (structured prompt). */
async function describeFrame(
  providers: ReturnType<typeof enabledProviders>,
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  framePath: string,
  at: number,
  signal: AbortSignal,
): Promise<string> {
  for (const provider of providers) {
    const apiKey = await resolveApiKey(provider.apiKeyEnv)
    if (apiKey === undefined) continue
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error('vision timeout')), provider.timeoutMs ?? 30_000)
    try {
      const data = await readFile(framePath)
      const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
      const response = await fetch(chatCompletionsUrl(provider.baseURL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        redirect: 'error',
        signal: upstream,
        body: JSON.stringify({
          model: provider.model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: FRAME_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data.toString('base64')}` } },
            ],
          }],
          max_tokens: 400,
        }),
      })
      if (!response.ok) continue
      const text = extractAssistantText(await response.json())
      if (text !== '') return `第${Math.round(at)}秒：${text}`
    } catch {
      // try the next provider
    } finally {
      // Always release the timeout, including the abort/network error path (M1).
      clearTimeout(timeout)
    }
  }
  return `第${Math.round(at)}秒：（画面描述失败，帧路径 ${framePath}）`
}

/** Extract subtitle text mentioned in one frame description (画面字幕). */
function extractSubtitleFromFrame(desc: string): string | null {
  // Frame descriptions mention subtitles like 底部有一行中文字幕："…" or
  // 字幕：… / 中文字幕：“…” — grab the quoted part after 字幕.
  const m = desc.match(/字幕[:：]?\s*[“"']([^”"']+)[”"']/)
  if (m !== null && m[1] !== undefined && m[1].trim() !== '') return m[1].trim()
  // Fallback: any quoted text following 字幕.
  const m2 = desc.match(/字幕[:：]?\s*(.{2,40})/)
  return m2 !== null && m2[1] !== undefined ? m2[1].trim() : null
}

/** Compose the model-visible report: time-axis (画面+声音 per slice) + 交叉验证. */
function composeReport(
  out: WorkerOutput,
  question: string,
  audio: AudioUnderstanding[],
  frameDescs: Array<{ at: number; text: string }>,
): string {
  const parts: string[] = []
  if (out.meta !== undefined && Object.keys(out.meta).length > 0) {
    const m = out.meta
    parts.push([
      `视频标题：${m.title ?? '未知'}`,
      m.uploader !== undefined ? `UP主/作者：${m.uploader}` : '',
      typeof m.duration === 'number' && m.duration > 0 ? `时长：${Math.round(m.duration)}秒` : '',
      m.source === 'local-file' ? `文件：${m.path}` : m.webpage_url !== undefined ? `链接：${m.webpage_url}` : '',
    ].filter(Boolean).join('\n'))
  }

  // 交叉验证: collect on-screen subtitle text and compare with transcript.
  const subtitleLines: string[] = []
  for (const frame of frameDescs) {
    const sub = extractSubtitleFromFrame(frame.text)
    if (sub !== null && !subtitleLines.includes(sub)) subtitleLines.push(sub)
  }

  // 时间轴: merge frames + audio slices by time.
  const timeline: string[] = []
  const allTimes = [...frameDescs.map(f => f.at), ...audio.map(a => a.start ?? 0)].sort((a, b) => a - b)
  const seen = new Set<number>()
  for (const t of allTimes) {
    const key = Math.round(t)
    if (seen.has(key)) continue
    seen.add(key)
    const frame = frameDescs.find(f => Math.round(f.at) === key)
    const slice = audio.find(a => a.start !== undefined && Math.round(a.start) === key)
    const row: string[] = []
    if (frame !== undefined) row.push(`画面：${frame.text.slice(0, 400)}`)
    if (slice !== undefined) {
      const tag = slice.high === true ? '（含语气/音乐/节奏）' : ''
      row.push(`声音${tag}：${slice.text ?? slice.error ?? ''}`)
    }
    if (row.length > 0) timeline.push(`[${formatTime(key)}] ${row.join('\n    ')}`)
  }
  if (timeline.length > 0) parts.push(`【时间轴】\n${timeline.join('\n')}`)

  // 画面字幕 (independent list for cross-checking).
  if (subtitleLines.length > 0) {
    parts.push(`【画面字幕】${subtitleLines.join(' ｜ ')}`)
  }

  // 配音稿 (transcript).
  if (out.transcript !== null && out.transcript !== undefined) {
    const source = out.transcript.source === 'subtitle' ? '字幕轨' : '语音识别'
    const lang = out.transcript.language ?? ''
    parts.push(`【配音稿（${source}${lang ? ` / ${lang}` : ''}）】\n${out.transcript.text?.trim() ?? ''}`.trim())
  }

  // 声音理解 (per-slice, without timeline duplication).
  const audioParts = audio.filter(a => a.start === undefined || !seen.has(Math.round(a.start)))
  if (audioParts.length > 0) {
    const lines = audioParts.map(a => a.ok
      ? `[${formatTime(a.start ?? 0)}${a.end !== undefined ? '-' + formatTime(a.end) : ''}] ${a.text}`
      : `[${formatTime(a.start ?? 0)}] ${a.error ?? '不可用'}`)
    parts.push(`【声音理解】\n${lines.join('\n')}`)
  }

  parts.push(`【用户问题】${question}`)
  return parts.join('\n\n')
}

/** Format seconds as mm:ss. */
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/**
 * Watch and analyze a video (local file path or URL) — the video branch of
 * the unified looklook_see tool.
 * @returns the composed report text (or a failure message).
 */
export async function watchVideo(
  ctx: Context,
  audioScope: AudioScope,
  visionScope: VisionScope,
  source: string,
  question: string,
  signal: AbortSignal,
): Promise<string> {
  if (source === '') return '看视频失败：缺少 source 参数（视频文件路径或链接）'
  const isUrl = /^https?:\/\//.test(source)
  try {
    const workerOut = await runWorker(
      source,
      {
        transcript: true,
        frames: 20,
        lang: 'zh',
        ...(isUrl ? { proxy: process.env.DISCORD_PROXY } : {}),
      },
      signal,
    )
    if (!workerOut.ok) {
      return `看视频失败：${workerOut.error ?? '未知错误'}`
    }

    const credentials = ctx.get('credentials')
    const resolveApiKey = async (ref: string): Promise<string | undefined> => {
      if (credentials === undefined) return undefined
      const resolvedCred = await credentials.resolve(credentialRef(ref))
      return resolvedCred?.value
    }

    // Audio understanding: slice by ASR pauses (or fixed 60s blocks when the
    // transcript has no segments), probe capability per slice. Runs whenever
    // there is an audio path — WITH subtitles too, because L3 (tone / music /
    // pace) is exactly what subtitles cannot provide (H3 fix).
    const audioPath = workerOut.audio_path ?? workerOut.video_path
    const duration = typeof workerOut.meta?.duration === 'number' ? workerOut.meta.duration : 0
    let audio: AudioUnderstanding[] = []
    if (audioPath !== undefined && audioPath !== '') {
      const segments = workerOut.transcript?.segments ?? null
      const slices = audioSlicesOf(segments, duration)
      audio = await understandAudio(
        enabledAudioProviders(audioScope),
        resolveApiKey,
        audioPath,
        question,
        signal,
        slices,
      )
    }

    // Frames → vision model (画面 + 字幕), scene-driven from worker.
    const frameDescs: Array<{ at: number; text: string }> = []
    const visionProviders = enabledProviders(visionScope)
    for (const frame of workerOut.frames ?? []) {
      const desc = await describeFrame(visionProviders, resolveApiKey, frame.path, frame.time, signal)
      frameDescs.push({ at: frame.time, text: desc })
    }

    return composeReport(workerOut, question, audio, frameDescs)
  } catch (error) {
    return `看视频失败：${error instanceof Error ? error.message : String(error)}`
  }
}
