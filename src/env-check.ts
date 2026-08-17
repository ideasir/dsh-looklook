/**
 * dsh-looklook/env-check — environment self-check for the plugin's external
 * dependencies, plus one-click repair for the pieces that can be fixed from
 * inside the plugin (Python packages). System-level installs (Python itself,
 * ffmpeg) are reported with concrete guidance instead of being auto-installed.
 *
 * Checks:
 * - Python runtime (python3 / python / py) — required by the video worker and
 *   the local ASR install;
 * - ffmpeg — required by video frame extraction / audio sampling;
 * - yt-dlp (Python package) — required by video-URL analysis; **repairable**
 *   via `python -m pip install yt-dlp`;
 * - local ASR install (faster-whisper + ready marker) — repairable via the
 *   existing one-click ASR installer.
 */

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { configuredVideoProxy } from './video-tool.ts'
import { detectPython } from './python-env.ts'
import { localAsrReady, ensureVenv, VENV_DIR } from './asr-install.ts'

/** The plugin's isolated venv python (POSIX bin/python, Windows Scripts/python.exe). */
const VENV_PYTHON = process.platform === 'win32'
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python')

/** Whether the plugin's isolated venv exists on disk. */
async function venvExists(): Promise<boolean> {
  try {
    await access(VENV_PYTHON)
    return true
  } catch {
    return false
  }
}

/** The python to run plugin tooling (venv first, system python fallback). */
async function resolveToolPython(): Promise<{ command?: string; system: string }> {
  const pyEnv = await detectPython()
  const system = pyEnv.ok && pyEnv.command !== undefined ? pyEnv.command : undefined
  if (await venvExists()) return { command: VENV_PYTHON, system: system ?? VENV_PYTHON }
  return { command: system, system: system ?? '' }
}

/** One dependency check result. */
export interface EnvCheckItem {
  /** Stable id for the client to key UI on. */
  id: string
  /** Human-readable label (Chinese). */
  label: string
  /** 'ok' = present/working; 'missing' = not found; 'error' = probe failed. */
  status: 'ok' | 'missing' | 'error'
  /** Short status text for the dialog (e.g. the detected version). */
  detail: string
  /** Whether this item can be repaired with a one-click action. */
  repairable: boolean
  /** One-click repair action id (only when repairable). */
  repairAction?: 'install-yt-dlp' | 'install-asr'
  /** Guidance shown when the item is missing and not repairable. */
  guidance?: string
}

/** The full environment report returned to the settings dialog. */
export interface EnvCheckReport {
  ok: boolean
  items: EnvCheckItem[]
  /** A one-line summary for the dialog title. */
  summary: string
}

/** Run one command, return { ok, stdout, stderr }. */
function runProbe(command: string, args: readonly string[], timeoutMs = 10_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolveBody) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      resolveBody({ ok: false, stdout, stderr: 'probe timed out' })
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveBody({ ok: code === 0, stdout, stderr })
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveBody({ ok: false, stdout, stderr: String(error) })
    })
  })
}

/** Check ffmpeg presence (and show its version when present). */
async function checkFfmpeg(): Promise<EnvCheckItem> {
  const probe = await runProbe('ffmpeg', ['-version'], 8_000)
  if (probe.ok) {
    const firstLine = probe.stdout.split('\n')[0] ?? 'ffmpeg'
    return {
      id: 'ffmpeg',
      label: 'ffmpeg（视频抽帧 / 音频采样）',
      status: 'ok',
      detail: firstLine.trim().slice(0, 80),
      repairable: false,
      guidance: 'ffmpeg 未安装。请用系统包管理器安装：\n• Debian/Ubuntu：`sudo apt install ffmpeg`\n• macOS：`brew install ffmpeg`\n• Windows：从 ffmpeg.org 下载并加入 PATH',
    }
  }
  return {
    id: 'ffmpeg',
    label: 'ffmpeg（视频抽帧 / 音频采样）',
    status: probe.stderr.includes('ENOENT') ? 'missing' : 'error',
    detail: probe.stderr.trim().slice(-100) || '未安装',
    repairable: false,
    guidance: 'ffmpeg 未安装。请用系统包管理器安装：\n• Debian/Ubuntu：`sudo apt install ffmpeg`\n• macOS：`brew install ffmpeg`\n• Windows：从 ffmpeg.org 下载并加入 PATH',
  }
}

/** Check yt-dlp (Python package) — repairable via pip. */
async function checkYtDlp(pythonCmd: string): Promise<EnvCheckItem> {
  const probe = await runProbe(
    pythonCmd,
    ['-c', 'import yt_dlp.version; print(yt_dlp.version.__version__)'],
    15_000,
  )
  if (probe.ok) {
    return {
      id: 'yt-dlp',
      label: 'yt-dlp（视频链接下载）',
      status: 'ok',
      detail: `已安装 ${probe.stdout.trim().slice(0, 40) || ''}`.trim(),
      repairable: false,
    }
  }
  return {
    id: 'yt-dlp',
    label: 'yt-dlp（视频链接下载）',
    status: 'missing',
    detail: '未安装或导入失败',
    repairable: true,
    repairAction: 'install-yt-dlp',
  }
}

/** Check the local ASR install — repairable via the one-click installer. */
async function checkLocalAsr(): Promise<EnvCheckItem> {
  const ready = await localAsrReady()
  return {
    id: 'asr',
    label: '本地 ASR（faster-whisper）',
    status: ready ? 'ok' : 'missing',
    detail: ready ? '已就绪' : '未安装',
    repairable: true,
    repairAction: 'install-asr',
    ...ready ? {} : { guidance: '点击「一键修复」安装 faster-whisper 与转写模型（约 1.5 GB，耗时较长）。' },
  }
}

/** Repair one action. Returns the new per-item state. */
export async function repairEnv(action: 'install-yt-dlp' | 'install-asr'): Promise<EnvCheckItem> {
  if (action === 'install-asr') {
    // Delegate to the existing one-click ASR installer (idempotent).
    const { performInstall } = await import('./asr-install.ts')
    await performInstall()
    return await checkLocalAsr()
  }
  // install-yt-dlp: install INTO the plugin's isolated venv (create it on
  // first use). Never touches the system Python.
  const pyEnv = await detectPython()
  if (!pyEnv.ok || pyEnv.command === undefined) {
    return {
      id: 'yt-dlp',
      label: 'yt-dlp（视频链接下载）',
      status: 'error',
      detail: pyEnv.error ?? '未找到 Python 运行时',
      repairable: false,
      guidance: '需要先安装 Python 3.9+ 才能安装 yt-dlp。',
    }
  }
  const venvPy = await ensureVenv(pyEnv.command, VENV_DIR)
  if (venvPy === undefined) {
    return {
      id: 'yt-dlp',
      label: 'yt-dlp（视频链接下载）',
      status: 'error',
      detail: '创建隔离 Python 环境失败',
      repairable: false,
      guidance: '请手动检查 Python venv 模块是否可用（`python3 -m venv --help`）。',
    }
  }
  const pip = await runProbe(venvPy, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'yt-dlp'], 120_000)
  if (!pip.ok) {
    return {
      id: 'yt-dlp',
      label: 'yt-dlp（视频链接下载）',
      status: 'error',
      detail: `pip 安装失败：${pip.stderr.trim().slice(-120)}`,
      repairable: true,
      repairAction: 'install-yt-dlp',
    }
  }
  return await checkYtDlp(venvPy)
}

/** Report whether a proxy is configured without exposing its URL or credentials. */
function checkVideoProxy(): EnvCheckItem {
  const configured = configuredVideoProxy() !== undefined
  return {
    id: 'proxy',
    label: '网络代理（视频链接）',
    // Proxy is optional: its absence must not make the whole environment
    // check fail for local videos or platforms reachable without a proxy.
    status: 'ok',
    detail: configured ? '已检测到代理配置（视频链接将尝试使用）' : '未检测到代理配置（本地视频和直连平台仍可用）',
    repairable: false,
    ...configured ? {} : { guidance: 'YouTube 等境外视频需要可用代理。可配置 DISCORD_PROXY、HTTPS_PROXY、HTTP_PROXY 或 ALL_PROXY 后重启 DSH。' },
  }
}

/** Build the full environment report. */
export async function runEnvCheck(): Promise<EnvCheckReport> {
  const items: EnvCheckItem[] = []
  items.push(checkVideoProxy())

  // 1) Python runtime (system) + isolated venv status.
  const pyEnv = await detectPython()
  const hasVenv = await venvExists()
  if (pyEnv.ok && pyEnv.command !== undefined) {
    const probe = await runProbe(pyEnv.command, ['--version'], 8_000)
    items.push({
      id: 'python',
      label: 'Python 运行时',
      status: 'ok',
      detail: `${probe.ok ? probe.stdout.trim() || pyEnv.command : pyEnv.command}${hasVenv ? '（隔离环境已就绪）' : '（隔离环境未创建，装本地 ASR 时自动创建）'}`,
      repairable: false,
    })
  } else {
    items.push({
      id: 'python',
      label: 'Python 运行时',
      status: 'missing',
      detail: pyEnv.error ?? '未找到',
      repairable: false,
      guidance: '视频分析和本地 ASR 依赖 Python 3.9+。请安装后确保 `python3`（或 `python`/`py`）在 PATH 中。\n• Windows：从 python.org 下载安装（安装时勾选 Add to PATH）\n• macOS：`brew install python`\n• Debian/Ubuntu：`sudo apt install python3`',
    })
  }

  // 2) ffmpeg.
  items.push(await checkFfmpeg())

  // 3) yt-dlp (venv-first; repairable into the venv).
  const tool = await resolveToolPython()
  if (tool.command !== undefined) {
    items.push(await checkYtDlp(tool.command))
  } else {
    items.push({
      id: 'yt-dlp',
      label: 'yt-dlp（视频链接下载）',
      status: 'missing',
      detail: '依赖 Python，未检测',
      repairable: false,
      guidance: '先安装 Python 后再检测。',
    })
  }

  // 4) local ASR.
  items.push(await checkLocalAsr())

  const failed = items.filter(item => item.status !== 'ok').length
  return {
    ok: failed === 0,
    items,
    summary: failed === 0
      ? '全部就绪，插件功能可用。'
      : `${failed} 项未就绪${items.some(item => item.repairable && item.status !== 'ok') ? '（部分可一键修复）' : ''}。`,
  }
}
