/**
 * Shared Python runtime detection for dsh-looklook.
 *
 * The video worker both spawn Python. The executable
 * name differs across environments (python3 on most Linux/macOS, `python` on
 * some minimal installs, `py` on Windows), so we probe once per process and
 * remember the winner. The failure message names the likely fix instead of
 * just echoing `ENOENT`.
 */

import { spawn } from 'node:child_process'

/** Candidate Python executable names in preference order. */
const PYTHON_CANDIDATES = ['python3', 'python', 'py'] as const

/** One probe result. */
interface ProbeResult {
  ok: boolean
  /** The working executable path/name, when found. */
  command: string | undefined
  /** Human-readable failure (why nothing worked). */
  error: string | undefined
}

let cached: ProbeResult | undefined

/** Probe whether one candidate runs (`--version` exits 0). */
function probeCandidate(command: string): Promise<boolean> {
  return new Promise((resolveBody) => {
    const child = spawn(command, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolveBody(false)
    }, 5_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolveBody(code === 0)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolveBody(false)
    })
  })
}

/** Detect a usable Python runtime (cached per process). */
export async function detectPython(): Promise<ProbeResult> {
  if (cached !== undefined) return cached
  for (const candidate of PYTHON_CANDIDATES) {
    if (await probeCandidate(candidate)) {
      cached = { ok: true, command: candidate, error: undefined }
      return cached
    }
  }
  cached = {
    ok: false,
    command: undefined,
    error: '未找到可用的 Python 运行时（尝试了 python3 / python / py）。请先安装 Python 3.9+ 并确保它在 PATH 中。',
  }
  return cached
}

/** Reset the cached probe (used by tests / hot reload). */
export function resetPythonDetection(): void {
  cached = undefined
}

// ── Isolated venv support (shared by env-check yt-dlp repair) ──────────
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The plugin's isolated venv root: $DSH_HOME/looklook-venv. */
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
export const VENV_DIR = join(DSH_HOME, 'looklook-venv')

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
  const existing = await new Promise<boolean>(resolve => {
    const child = spawn(venvPy, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, 5_000)
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
    child.on('error', () => { clearTimeout(timer); resolve(false) })
  })
  if (existing) return venvPy
  const created = await new Promise<boolean>(resolve => {
    const child = spawn(basePython, ['-m', 'venv', venvDir], { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, 120_000)
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
    child.on('error', () => { clearTimeout(timer); resolve(false) })
  })
  if (!created) return undefined
  const check = await new Promise<boolean>(resolve => {
    const child = spawn(venvPy, ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false) }, 5_000)
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0) })
    child.on('error', () => { clearTimeout(timer); resolve(false) })
  })
  return check ? venvPy : undefined
}

/** The venv's python executable path (POSIX: bin/python, Windows: Scripts/python.exe). */
export const VENV_PYTHON = process.platform === 'win32'
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python')
