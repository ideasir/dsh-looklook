/**
 * dsh-looklook/asr-install — local ASR one-click install support.
 *
 * The local ASR (faster-whisper + a small wrapper script) lives OUTSIDE the
 * plugin package, under `<dshHome>/looklook-asr/` (machine-local state, never
 * shipped in the tarball and never wiped by a package reinstall). Install
 * steps:
 *   1. env check: python3 + ffmpeg present;
 *   2. create an ISOLATED venv at `<dshHome>/looklook-venv` so nothing
 *      touches the system Python;
 *   3. pip install faster-whisper INTO the venv;
 *   4. download the chosen model (tiny/base/small/medium/large-v3) via the
 *      HF mirror (hf-mirror.com — direct huggingface.co times out in many
 *      regions);
 *   5. write transcribe.py + a `ready` marker (transcribe.py runs with the
 *      venv's own python).
 *
 * The model is EXCLUSIVE: installing a new size removes the previously
 * downloaded model (faster-whisper caches under `~/.cache/huggingface/hub`),
 * so only one model ever occupies disk.
 *
 * The trigger/status are exposed as Remote RPCs on `remote.looklook`
 * (asrStatus / asrInstall) — no unauth'd HTTP routes.
 */

import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { detectPython } from './python-env.ts'

/**
 * The local ASR root: `$DSH_HOME/looklook-asr`, falling back to
 * `~/.dsh/looklook-asr`. Kept OUTSIDE node_modules so `pnpm install` never
 * wipes the downloaded model.
 */
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const ASR_DIR = join(DSH_HOME, 'looklook-asr')
/** The isolated Python venv for the plugin's packages (ASR + yt-dlp). */
export const VENV_DIR = join(DSH_HOME, 'looklook-venv')
/** The ready marker: written only after a successful install. */
const READY_MARKER = join(ASR_DIR, 'ready')
/** The transcribe wrapper script (invoked by the video tool). */
export const TRANSCRIBE_SCRIPT = join(ASR_DIR, 'transcribe.py')

/** One selectable local-ASR model size. */
export interface AsrModelOption {
  /** faster-whisper model id (also the download name). */
  id: string
  /** Display name. */
  name: string
  /** Human size label. */
  sizeLabel: string
  /** Approximate download size in bytes (for the picker). */
  bytes: number
}

/** The selectable ASR models, smallest first. */
export const ASR_MODEL_OPTIONS: AsrModelOption[] = [
  { id: 'tiny', name: '极速 tiny', sizeLabel: '约 75 MB', bytes: 75 * 1024 * 1024 },
  { id: 'base', name: '轻量 base', sizeLabel: '约 145 MB', bytes: 145 * 1024 * 1024 },
  { id: 'small', name: '标准 small（推荐）', sizeLabel: '约 466 MB', bytes: 466 * 1024 * 1024 },
  { id: 'medium', name: '中等 medium', sizeLabel: '约 1.5 GB', bytes: 1.5 * 1024 * 1024 * 1024 },
  { id: 'large-v3', name: '大模型 large-v3', sizeLabel: '约 3 GB', bytes: 3 * 1024 * 1024 * 1024 },
]

/** Default model when the caller does not choose (small — good CPU speed/accuracy). */
export const DEFAULT_ASR_MODEL = 'small'

/** HF endpoint: the mirror, because direct huggingface.co downloads time out
 * in many regions (recorded in the DEVLOG since round 1). */
const HF_ENDPOINT = 'https://hf-mirror.com'

/** Current install phase, reported by GET status. */
export type AsrInstallPhase = 'none' | 'checking' | 'installing-deps' | 'downloading-model' | 'writing' | 'done' | 'failed'

/** In-memory install progress (single installer at a time). */
let installState: { phase: AsrInstallPhase; error?: string } = { phase: 'none' }

/** Resolve a model option by id; undefined when unknown. */
export function asrModelOption(id: string): AsrModelOption | undefined {
  return ASR_MODEL_OPTIONS.find(option => option.id === id)
}

/**
 * Create (once) the plugin's isolated venv and return its python executable.
 * POSIX: <venv>/bin/python ; Windows: <venv>/Scripts/python.exe.
 * Returns undefined when the venv cannot be created.
 */
export async function ensureVenv(basePython: string, venvDir: string): Promise<string | undefined> {
  const venvPy = process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python')
  // Already exists and runs?
  const existing = await run(venvPy, ['--version'])
  if (existing.ok) return venvPy
  const created = await run(basePython, ['-m', 'venv', venvDir], 120_000)
  if (!created.ok) return undefined
  const check = await run(venvPy, ['--version'])
  return check.ok ? venvPy : undefined
}

/** Whether the local ASR install is complete (ready marker exists). */
export async function localAsrReady(): Promise<boolean> {
  try {
    await access(READY_MARKER, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Read the installed model id from the marker (undefined when none). */
export async function installedAsrModel(): Promise<string | undefined> {
  const marker = await readReadyMarker()
  if (marker === undefined) return undefined
  const match = marker.match(/^model=(.+)$/m)
  return match !== null && match[1] !== undefined ? match[1].trim() : undefined
}

/**
 * Delete every OTHER faster-whisper model from the HF cache, keeping only
 * `keepModel`. The cache lives under `~/.cache/huggingface/hub` (or
 * $HF_HOME/hub) as `models--Systran--faster-whisper-<id>` directories.
 * Best-effort: a failed deletion never blocks the install.
 */
async function purgeOtherModels(keepModel: string): Promise<void> {
  const hub = join(process.env.HF_HOME ?? join(homedir(), '.cache', 'huggingface'), 'hub')
  let entries: string[]
  try {
    entries = await readdir(hub)
  } catch {
    return // no cache yet — nothing to purge
  }
  const prefix = 'models--Systran--faster-whisper-'
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue
    const id = entry.slice(prefix.length)
    if (id === keepModel) continue
    try {
      await rm(join(hub, entry), { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

/** Run a command and collect output; resolves true on exit code 0.
 * ALWAYS settles: on timeout the child is killed AND the promise resolves
 * (a kill without resolve would strand installState in a mid phase and make
 * every later "one-click repair" report already:true — the reported
 * "点了修复没反应" bug). */
function run(
  cmd: string,
  args: readonly string[],
  timeoutMs = 600_000,
  env?: Record<string, string>,
): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolveBody) => {
    let settled = false
    const settle = (result: { ok: boolean; stderr: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveBody(result)
    }
    let child: ReturnType<typeof spawn> | null = null
    try {
      child = spawn(cmd, [...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...env === undefined ? {} : { env: { ...process.env, ...env } },
      })
    } catch (error) {
      settle({ ok: false, stderr: String(error) })
      return
    }
    let stderr = ''
    const timer = setTimeout(() => {
      // Kill, then settle: a hung child must not block the pipeline forever.
      child?.kill('SIGKILL')
      settle({ ok: false, stderr: `${stderr.trim().slice(-300)}（超时 ${Math.round(timeoutMs / 1000)}s）` })
    }, timeoutMs)
    child?.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => {
      settle({ ok: code === 0, stderr: stderr.trim().slice(-500) })
    })
    child.on('error', (error) => {
      settle({ ok: false, stderr: String(error) })
    })
  })
}

/** The transcribe.py wrapper for one model id (writes plain transcript text). */
function transcribeScript(modelId: string): string {
  return `import sys
try:
    from faster_whisper import WhisperModel
except Exception as e:
    print("faster_whisper not installed: %s" % e, file=sys.stderr)
    sys.exit(1)
audio = sys.argv[1]
model = WhisperModel(${JSON.stringify(modelId)}, device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, language="zh", vad_filter=True, beam_size=5)
for seg in segments:
    t = seg.text.strip()
    if t:
        print(t)
`
}

/** Run the full install for one model id; updates installState as it goes.
 * Re-entrant calls (two concurrent asrInstall RPCs) are refused: the second
 * call sees the non-'none' phase and returns already:true. */
export async function performInstall(modelId = DEFAULT_ASR_MODEL): Promise<void> {
  // Refuse ONLY while an install is actively running. 'done' must stay
  // restartable: a swap (install a different model after a successful
  // install) re-enters here with phase 'done' and MUST run — otherwise
  // 换装 silently no-ops (the old bug).
  if (installState.phase === 'checking' || installState.phase === 'installing-deps'
      || installState.phase === 'downloading-model' || installState.phase === 'writing') return
  const option = asrModelOption(modelId)
  if (option === undefined) {
    installState = { phase: 'failed', error: `未知的 ASR 模型：${modelId}` }
    return
  }
  installState = { phase: 'checking' }
  try {
    // 1) env check: Python runtime (auto-detected: python3/python/py) + ffmpeg.
    const pyEnv = await detectPython()
    if (!pyEnv.ok || pyEnv.command === undefined) {
      throw new Error(pyEnv.error ?? '未找到可用的 Python 运行时')
    }
    const pythonCmd = pyEnv.command
    const py = await run(pythonCmd, ['--version'])
    if (!py.ok) throw new Error(`Python 不可用（${pythonCmd}）：${py.stderr || '运行失败'}`)
    const ff = await run('ffmpeg', ['-version'], 10_000)
    if (!ff.ok) throw new Error('ffmpeg 不可用，请先安装 ffmpeg')
    await mkdir(ASR_DIR, { recursive: true })

    // 2) Create an ISOLATED venv (<dshHome>/looklook-venv) so the plugin's
    //    Python packages never touch the system Python.
    installState = { phase: 'installing-deps' }
    const venvPy = await ensureVenv(pythonCmd, VENV_DIR)
    if (venvPy === undefined) throw new Error('创建隔离 Python 环境失败')

    // 3) deps inside the venv.
    const pip = await run(venvPy, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'faster-whisper'], 600_000)
    if (!pip.ok) throw new Error(`faster-whisper 安装失败：${pip.stderr}`)

    // 4) model download (via the HF mirror so it actually completes) —
    //    probe once so the model is cached into the venv's HF cache.
    installState = { phase: 'downloading-model' }
    const probeCode = `from faster_whisper import WhisperModel; WhisperModel(${JSON.stringify(option.id)}, device="cpu", compute_type="int8")`
    const probe = await run(venvPy, ['-c', probeCode], 1_800_000, { HF_ENDPOINT })
    if (!probe.ok) throw new Error(`模型下载失败：${probe.stderr}`)

    // 5) EXCLUSIVE model: remove every other cached faster-whisper model.
    await purgeOtherModels(option.id)

    // 6) write wrapper + marker (records the chosen model + venv).
    installState = { phase: 'writing' }
    await writeFile(TRANSCRIBE_SCRIPT, transcribeScript(option.id), 'utf8')
    await writeFile(READY_MARKER, `model=${option.id}\nvenv=${VENV_DIR}\n`, 'utf8')
    installState = { phase: 'done' }
  } catch (error) {
    installState = { phase: 'failed', error: error instanceof Error ? error.message : String(error) }
  }
}

/** Read the ready marker (for tests). */
export async function readReadyMarker(): Promise<string | undefined> {
  try {
    return await readFile(READY_MARKER, 'utf8')
  } catch {
    return undefined
  }
}

/** Read the current in-memory install phase (for the status RPC). */
export function currentInstallPhase(): AsrInstallPhase {
  return installState.phase
}

/** Read the last install error, if any. */
export function currentInstallError(): string | null {
  return installState.error ?? null
}
