/**
 * ModelSettings — the looklook "模型配置" section inside the plugin card:
 * - 视觉模型: recognizes images AND video frames (video = frames → image).
 *   Primary + fallbacks with automatic failover.
 * - 音频模型: transcript + sound understanding in one config; the plugin
 *   probes the model's capability at use time (no user label needed).
 *   Plus a one-click local ASR install (faster-whisper medium).
 *
 * Both lists reuse {@link ProviderListEditor}; the local ASR install is a
 * small status/trigger card wired to the host routes.
 */

import { useEffect, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ProviderListEditor } from './ProviderListEditor.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface ModelSettingsInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: (provider: { baseURL: string; apiKeyEnv: string }) => Promise<
    { ok: true; models: string[] } | { ok: false; error: string }
  >
}

/** Local ASR install status (from the host routes). */
interface AsrStatus {
  installed: boolean
  phase: string
  error?: string | null
}

const css = {
  stack: { display: 'flex', flexDirection: 'column', gap: 28, color: 'var(--dsw-alias-label-primary)' },
  divider: { border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)' },
  asrCard: {
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  asrText: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 },
  asrTitle: { fontSize: 13, lineHeight: '20px', fontWeight: 600 },
  asrDesc: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  asrBadge: {
    flex: 'none',
    padding: '2px 10px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 999,
    fontSize: 12,
    lineHeight: '18px',
  },
} as const

/** One-click local ASR install card. */
function LocalAsrCard({ api, t }: { api: IApiClient; t: TranslateNS<'looklook'> }) {
  const [status, setStatus] = useState<AsrStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch('/api/looklook-asr-status')
      const body = await response.json() as AsrStatus
      setStatus(body)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void refresh() }, [api])

  const install = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/looklook-asr-install', { method: 'POST' })
      const body = await response.json() as { ok?: boolean; error?: string }
      if (body.ok !== true) throw new Error(body.error ?? '启动安装失败')
      // Poll until done/failed.
      await new Promise<void>((resolveBody) => {
        const timer = setInterval(async () => {
          await refresh()
          if (status !== null && (status.phase === 'done' || status.phase === 'failed')) {
            clearInterval(timer)
            resolveBody()
          }
        }, 1500)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const phaseLabel = (phase: string): string => {
    switch (phase) {
      case 'checking': return '环境检查中…'
      case 'installing-deps': return '安装依赖中…'
      case 'downloading-model': return '下载模型中…（约 1.5GB，视网速而定）'
      case 'writing': return '写入本地服务…'
      case 'done': return '已就绪'
      case 'failed': return '安装失败'
      default: return '未安装'
    }
  }

  const installed = status?.installed === true || status?.phase === 'done'

  return (
    <div style={css.asrCard}>
      <div style={css.asrText}>
        <span style={css.asrTitle}>{t('asr.local.title')}</span>
        <span style={css.asrDesc}>
          {status === null
            ? t('asr.local.checking')
            : installed
              ? t('asr.local.ready')
              : phaseLabel(status.phase)}
        </span>
        {error !== null && <span style={css.asrDesc}>{error}</span>}
        {status?.error !== undefined && status.error !== null && status.error !== ''
          && <span style={css.asrDesc}>{status.error}</span>}
      </div>
      {!installed && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void install()}>
          {busy ? '…' : t('asr.local.install')}
        </Button>
      )}
      {installed && <span style={css.asrBadge}>{t('asr.local.readyBadge')}</span>}
    </div>
  )
}

/** The model-configuration body (visual + audio sections). */
export function ModelSettingsSection(props: ModelSettingsInjected) {
  const { api, t, listModels } = props
  return (
    <div style={css.stack}>
      <ProviderListEditor
        api={api}
        t={t}
        ns="vision"
        title={t('settings.vision.title')}
        intro={t('settings.vision.intro')}
        listModels={listModels}
      />
      <div style={css.divider} />
      <ProviderListEditor
        api={api}
        t={t}
        ns="looklook-audio"
        title={t('settings.audio.title')}
        intro={t('settings.audio.intro')}
      />
      <LocalAsrCard api={api} t={t} />
    </div>
  )
}
