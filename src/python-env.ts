/**
 * Shared Python runtime detection for dsh-looklook.
 *
 * The ASR installer and the video worker both spawn Python. The executable
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
    error: '未找到可用的 Python 运行时（尝试了 python3 / python / py）。请先安装 Python 3.9+ 并确保它在 PATH 中，然后重试本地 ASR 安装。',
  }
  return cached
}

/** Reset the cached probe (used by tests / hot reload). */
export function resetPythonDetection(): void {
  cached = undefined
}
