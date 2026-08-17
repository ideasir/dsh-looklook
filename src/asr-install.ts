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
 *   4. download the model (medium) via HF mirror;
 *   5. write transcribe.py + a `ready` marker (transcribe.py runs with the
 *      venv's own python).
 *
 * The trigger/status are exposed as Remote RPCs on `remote.looklook`
 * (asrStatus / asrInstall) — no unauth'd HTTP routes.
 */

import { spawn } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
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
/** The ASR model id (fixed: medium — good accuracy on CPU). */
export const LOCAL_ASR_MODEL = 'medium'

/** Current install phase, reported by GET status. */
export type AsrInstallPhase = 'none' | 'checking' | 'installing-deps' | 'downloading-model' | 'writing' | 'done' | 'failed'

/** In-memory install progress (single installer at a time). */
let installState: { phase: AsrInstallPhase; error?: string } = { phase: 'none' }

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

/** Run a command and collect output; resolves true on exit code 0. */
function run(cmd: string, args: readonly string[], timeoutMs = 600_000): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolveBody) => {
    const child = spawn(cmd, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveBody({ ok: code === 0, stderr: stderr.trim().slice(-500) })
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolveBody({ ok: false, stderr: String(error) })
    })
  })
}

/** The transcribe.py wrapper (writes plain transcript text to stdout). */
function transcribeScript(): string {
  return `import sys
try:
    from faster_whisper import WhisperModel
except Exception as e:
    print("faster_whisper not installed: %s" % e, file=sys.stderr)
    sys.exit(1)
audio = sys.argv[1]
model = WhisperModel(${JSON.stringify(LOCAL_ASR_MODEL)}, device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, language="zh", vad_filter=True, beam_size=5)
for seg in segments:
    t = seg.text.strip()
    if t:
        print(t)
`
}

/** Run the full install; updates installState as it goes. Re-entrant calls
 * (two concurrent asrInstall RPCs) are refused: the second call sees the
 * non-'none' phase and returns already:true, so performInstall itself only
 * ever runs one pipeline. */
export async function performInstall(): Promise<void> {
  if (installState.phase !== 'none' && installState.phase !== 'failed') return
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
    //    Python packages never touch the system Python and a reinstall or
    //    uninstall leaves nothing behind. No --break-system-packages needed.
    installState = { phase: 'installing-deps' }
    const venvPy = await ensureVenv(pythonCmd, VENV_DIR)
    if (venvPy === undefined) throw new Error('创建隔离 Python 环境失败')

    // 3) deps inside the venv.
    const pip = await run(venvPy, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'faster-whisper'], 600_000)
    if (!pip.ok) throw new Error(`faster-whisper 安装失败：${pip.stderr}`)

    // 4) model download (probe once so the model is cached)
    installState = { phase: 'downloading-model' }
    const probeCode = `from faster_whisper import WhisperModel; WhisperModel(${JSON.stringify(LOCAL_ASR_MODEL)}, device="cpu", compute_type="int8")`
    const probe = await run(venvPy, ['-c', probeCode], 1_800_000)
    if (!probe.ok) throw new Error(`模型下载失败：${probe.stderr}`)

    // 5) write wrapper + marker (records the venv python)
    installState = { phase: 'writing' }
    await writeFile(TRANSCRIBE_SCRIPT, transcribeScript(), 'utf8')
    await writeFile(READY_MARKER, `model=${LOCAL_ASR_MODEL}\nvenv=${VENV_DIR}\n`, 'utf8')
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
