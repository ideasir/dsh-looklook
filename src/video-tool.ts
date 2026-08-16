/**
 * dsh-looklook/video — the `looklook_watch` tool: understand a video, whether
 * it was uploaded as a local file (session `.uploads/`) or referenced by a
 * URL (Bilibili / YouTube / Douyin / generic via the vendored Python worker).
 *
 * Pipeline (all text flows to the text-only main model):
 *   1. vendor worker.py extracts metadata + transcript (platform subtitles
 *      first, else local faster-whisper ASR) + evenly spaced frames.
 *   2. When L3 audio understanding is configured (audioUnderstanding switch
 *      AND an audio-capable provider), a sample of the audio track is sent
 *      to the audio model for tone/music/pace; otherwise route A (transcript
 *      only) applies and the L3 block is omitted.
 *   3. Frames are staged on disk; their paths are returned so the main model
 *      can ask for a closer look (or the vision model can be extended later).
 *
 * All external calls are subprocesses of the vendored worker; missing Python
 * deps surface as a classified message instead of a crash.
 */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { AudioScope } from './settings.ts'
import { audioEnabled, enabledAudioProviders } from './settings.ts'
import { chatCompletionsUrl } from './vision-client.ts'

/** The vendored worker's directory (scripts/video-worker next to this file). */
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'video-worker')

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
}

/** One L3 audio-understanding result. */
interface AudioUnderstanding {
  ok: boolean
  text?: string
  error?: string
}

/**
 * Run the vendored Python worker as a subprocess.
 * @param source - local file path or video URL.
 * @param opts - worker options (frames, lang, asr model, proxy).
 * @returns the parsed worker JSON.
 */
function runWorker(
  source: string,
  opts: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs = 600_000,
): Promise<WorkerOutput> {
  return new Promise((resolveBody, rejectBody) => {
    const outdir = join(WORKER_DIR, '..', '..', 'tmp-worker-out')
    const args = ['worker.py', source, outdir, JSON.stringify(opts)]
    const child = spawn('python3', args, {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        // Model downloads fail on direct HF; the mirror works without proxy.
        ...(process.env.HF_ENDPOINT === undefined ? { HF_ENDPOINT: 'https://hf-mirror.com' } : {}),
        PYTHONIOENCODING: 'utf-8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectBody(new Error(`视频分析超时（${Math.round(timeoutMs / 1000)}s）`))
    }, timeoutMs)
    const onAbort = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      rejectBody(new Error('视频分析已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
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
        resolveBody(JSON.parse(stdout) as WorkerOutput)
      } catch (error) {
        rejectBody(new Error(`无法解析视频分析结果：${error instanceof Error ? error.message : String(error)}`))
      }
    })
  })
}

/**
 * L3: send a sample of the video's audio track to an audio-capable model to
 * understand tone / music / pace. Route A (transcript only) skips this.
 */
async function understandAudio(
  videoPath: string,
  providers: ReturnType<typeof enabledAudioProviders>,
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  question: string,
  signal: AbortSignal,
): Promise<AudioUnderstanding> {
  // Extract up to 60s of audio (16 kHz mono WAV) for the audio model.
  const tmpDir = join(WORKER_DIR, '..', '..', 'tmp-worker-out')
  const wav = join(tmpDir, 'audio_sample.wav')
  await runFfmpeg(['-y', '-i', videoPath, '-t', '60', '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', wav], signal)
  const data = await readFile(wav)
  const payload = {
    model: providers[0]?.model ?? '',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `请听这段视频音频，回答问题：${question}。注意语气、节奏、背景音乐等声音细节。只输出回答内容本身。` },
        { type: 'input_audio', input_audio: { data: data.toString('base64'), format: 'wav' } },
      ],
    }],
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), providers[0]?.timeoutMs ?? 30_000)
  const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
  try {
    const response = await fetch(chatCompletionsUrl(providers[0]?.baseURL ?? ''), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await resolveApiKey(providers[0]?.apiKeyEnv ?? '')}`,
      },
      redirect: 'error',
      signal: upstream,
      body: JSON.stringify(payload),
    })
    if (!response.ok) return { ok: false, error: `音频理解失败（HTTP ${response.status}）` }
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
    const text = typeof body.choices?.[0]?.message?.content === 'string'
      ? body.choices[0].message.content.trim()
      : ''
    if (text === '') return { ok: false, error: '音频模型返回了空内容' }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
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

/** Compose the model-visible report from worker output (+ optional L3). */
function composeReport(
  out: WorkerOutput,
  question: string,
  audio: AudioUnderstanding | null,
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
  const transcript = out.transcript
  if (transcript !== null && transcript !== undefined) {
    const source = transcript.source === 'subtitle' ? '字幕' : '语音识别'
    const lang = transcript.language ?? ''
    const head = `【配音稿（${source}${lang ? ` / ${lang}` : ''}）】`
    parts.push(`${head}\n${transcript.text?.trim() ?? ''}`.trim())
  } else {
    parts.push('【配音稿】无（该视频没有可用的字幕或音轨）')
  }
  if (audio !== null && audio !== undefined) {
    parts.push(audio.ok ? `【声音理解】${audio.text}` : `【声音理解】${audio.error ?? '不可用'}`)
  }
  const frames = out.frames ?? []
  if (frames.length > 0) {
    parts.push(`【画面帧】已抽取 ${frames.length} 帧，路径：${frames.map(f => f.path).join('，')}（如需查看具体画面细节，可告诉我分析哪一帧）`)
  }
  parts.push(`【用户问题】${question}`)
  return parts.join('\n\n')
}

/** Register the looklook_watch tool. */
export function registerWatchTool(
  ctx: Context,
  audioScope: AudioScope,
): void {
  ctx.tools.register(defineTool({
    name: 'looklook_watch',
    description: '观看并分析一个视频（支持本地视频文件路径，或 B站/YouTube/抖音/其他平台的视频链接）。返回视频元数据、配音稿（字幕或语音识别）、画面帧路径，以及（若配置了音频理解模型）声音细节。source 填视频文件路径或链接；question 填你要询问的视频内容相关问题（用户问什么就针对性地问什么）。',
    parameters: {
      source: {
        type: 'string',
        required: true,
        description: '视频文件路径或视频链接 URL。',
      },
      question: {
        type: 'string',
        required: true,
        description: '你要向视频询问的问题。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            required: true,
          },
        },
      },
      render: (_args: unknown, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    isConcurrencySafe: () => false,
    async execute(args: { source?: unknown; question?: unknown }, exec) {
      const source = typeof args.source === 'string' && args.source.trim() !== '' ? args.source.trim() : ''
      if (source === '') return { text: '看视频失败：缺少 source 参数（视频文件路径或链接）' }
      const question = typeof args.question === 'string' && args.question.trim() !== ''
        ? args.question.trim()
        : '请概述这个视频的内容。'
      const isUrl = /^https?:\/\//.test(source)
      try {
        const workerOut = await runWorker(
          source,
          {
            transcript: true,
            frames: 4,
            lang: 'zh',
            asr_model: 'small',
            ...(isUrl ? { proxy: process.env.DISCORD_PROXY } : {}),
          },
          exec.signal,
        )
        if (!workerOut.ok) {
          return { text: `看视频失败：${workerOut.error ?? '未知错误'}` }
        }
        // L3: audio understanding only when the user enabled it AND a provider
        // is configured AND we have a local video file to sample.
        let audio: AudioUnderstanding | null = null
        const l3On = audioEnabled(audioScope)
        const videoPath = workerOut.video_path
        if (l3On && videoPath !== undefined && videoPath !== '') {
          const credentials = ctx.get('credentials')
          const resolveApiKey = async (ref: string): Promise<string | undefined> => {
            if (credentials === undefined) return undefined
            const resolvedCred = await credentials.resolve(credentialRef(ref))
            return resolvedCred?.value
          }
          audio = await understandAudio(videoPath, enabledAudioProviders(audioScope), resolveApiKey, question, exec.signal)
        }
        return { text: composeReport(workerOut, question, audio) }
      } catch (error) {
        return { text: `看视频失败：${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }))
}
