/**
 * ModelSettings — the looklook "模型配置" section inside the plugin card:
 * - 视觉模型: recognizes images AND video frames (video = frames → image).
 *   Primary + fallbacks with automatic failover.
 * - 音频模型: transcript + sound understanding in one config; the plugin
 *   probes the model's capability at use time (no user label needed).
 *   Plus a one-click local ASR install (faster-whisper medium).
 *
 * Both lists reuse {@link ProviderListEditor}; the local ASR install card is
 * wired to the authorized remote.looklook RPCs (asrStatus / asrInstall).
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginSettingsClient } from './plugin-settings.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { ProviderListEditor } from './ProviderListEditor.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface ModelSettingsInjected {
  /** The wire API client. */
  api: IApiClient
  /** Plugin-owned settings and credential RPCs. */
  pluginSettings: PluginSettingsClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: (provider: { baseURL: string; apiKeyEnv: string; apiKey?: string }) => Promise<
    { ok: true; models: string[] } | { ok: false; error: string }
  >
  /** Probe whether one vision provider can actually see images. */
  testVision: (provider: { baseURL: string; apiKeyEnv: string; apiKey?: string; model: string }) => Promise<
    { ok: true; supportsImage: boolean; message: string } | { ok: false; error: string }
  >
  /** Probe one audio provider's capability level (L1/L2/none). */
  testAudio: (provider: { baseURL: string; apiKeyEnv: string; apiKey?: string; model: string }) => Promise<
    { ok: true; level: 'L1' | 'L2' | 'none'; message: string } | { ok: false; error: string }
  >
  /** Read the local ASR install state through the authorized RPC. */
  asrStatus: () => Promise<AsrStatus>
  /** Trigger the local ASR install for one model through the authorized RPC. */
  asrInstall: (model: string) => Promise<{ ok: true; phase: string; already: boolean } | { ok: false; error: string }>
}

/** One selectable ASR model (from the host). */
export interface AsrModelOption {
  id: string
  name: string
  sizeLabel: string
}

/** Local ASR install status (from the host RPC). */
export interface AsrStatus {
  installed: boolean
  phase: string
  /** Currently installed model id ('' when none). */
  model: string
  /** Selectable model sizes. */
  options: AsrModelOption[]
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
  // LocalAsrCard is a column card once model selection is shown.
  asrCardCol: {
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    color: 'var(--dsw-alias-label-primary)',
  },
  asrHead: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  asrModels: { display: 'flex', flexDirection: 'column', gap: 2 },
  asrModelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '3px 4px',
    borderRadius: 6,
    cursor: 'pointer',
  },
  asrModelName: { fontSize: 12, lineHeight: '18px', fontWeight: 500 },
  asrModelSize: { fontSize: 11, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  asrCurrentTag: {
    flex: 'none',
    padding: '0 8px',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 999,
    fontSize: 10,
    lineHeight: '16px',
    color: 'var(--dsw-alias-label-tertiary)',
  },
  asrActions: { display: 'flex', justifyContent: 'flex-end' },
} as const

/** One-click local ASR install card (all calls ride the authorized RPC).
 *  Model is selectable; the host keeps only ONE model on disk (installing a
 *  different size purges the previous one), so the card also offers "换装". */
function LocalAsrCard({ asrStatus, asrInstall, t }: {
  asrStatus: ModelSettingsInjected['asrStatus']
  asrInstall: ModelSettingsInjected['asrInstall']
  t: TranslateNS<'looklook'>
}) {
  const [status, setStatus] = useState<AsrStatus | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const body = await asrStatus()
      setStatus(body)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void refresh() }, [asrStatus])

  // Default the selection to the installed model, else the recommended
  // 'small', else the first option. Runs only until a choice is made.
  useEffect(() => {
    if (selectedModel !== '' || status === null) return
    const initial = status.model !== ''
      ? status.model
      : status.options.find(o => o.id === 'small')?.id
        ?? status.options[0]?.id
        ?? ''
    if (initial !== '') setSelectedModel(initial)
  }, [status, selectedModel])

  // Holds the active poll interval so the unmount effect can stop it.
  const pollTimerRef = useRef<number | null>(null)

  const install = async (model: string): Promise<void> => {
    if (model === '') return
    setBusy(true)
    setError(null)
    try {
      const body = await asrInstall(model)
      if (!body.ok) throw new Error(body.error ?? '启动安装失败')
      // already:true = same model already installed: nothing to wait for.
      if (body.already) { await refresh(); return }
      // Poll until done/failed. Read the LATEST status from each poll's own
      // response (not the render-closure status — the closure value is stale
      // and would never satisfy the terminal check, H4 fix). The interval is
      // cleared on completion, on error, and when the component unmounts.
      await new Promise<void>((resolveBody) => {
        let settled = false
        const finish = (): void => {
          if (settled) return
          settled = true
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current)
            pollTimerRef.current = null
          }
          resolveBody()
        }
        pollTimerRef.current = window.setInterval(async () => {
          let current: AsrStatus | null = null
          try {
            current = await asrStatus()
            setStatus(current)
            setError(null)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
          if (current !== null && (current.phase === 'done' || current.phase === 'failed')) {
            finish()
          }
        }, 1500)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  // Stop the poll interval when the card unmounts (collapsed settings card,
  // page leave) so it never keeps firing RPCs against a dead component.
  useEffect(() => () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const phaseLabel = (phase: string): string => {
    const size = status?.options.find(o => o.id === selectedModel)?.sizeLabel
    switch (phase) {
      case 'checking': return '环境检查中…'
      case 'installing-deps': return '安装依赖中…'
      case 'downloading-model': return `下载模型中…（${size ?? '视网速而定'}）`
      case 'writing': return '写入本地服务…'
      case 'done': return '已就绪'
      case 'failed': return '安装失败'
      default: return '未安装'
    }
  }

  const installed = status?.installed === true || status?.phase === 'done'
  const installedOption = status?.options.find(o => o.id === (status?.model ?? ''))
  const canSwitch = installed && selectedModel !== '' && selectedModel !== status?.model
  const options = status?.options ?? []

  return (
    <div style={css.asrCardCol}>
      <div style={css.asrHead}>
        <div style={css.asrText}>
          <span style={css.asrTitle}>{t('asr.local.title')}</span>
          <span style={css.asrDesc}>
            {status === null
              ? t('asr.local.checking')
              : installed
                ? `${t('asr.local.ready')}${installedOption ? ` · ${installedOption.name}（${installedOption.sizeLabel}）` : ''}`
                : phaseLabel(status.phase)}
          </span>
          {error !== null && <span style={css.asrDesc}>{error}</span>}
          {status?.error !== undefined && status.error !== null && status.error !== ''
            && <span style={css.asrDesc}>{status.error}</span>}
        </div>
        {installed && <span style={css.asrBadge}>{t('asr.local.readyBadge')}</span>}
      </div>
      {options.length > 0 && (
        <div style={css.asrModels}>
          {options.map(opt => {
            const isCurrent = installed && opt.id === status?.model
            const isSel = opt.id === selectedModel
            return (
              <label key={opt.id} style={css.asrModelRow}>
                <input
                  type="radio"
                  name="looklook-asr-model"
                  checked={isSel}
                  disabled={busy}
                  onChange={() => setSelectedModel(opt.id)}
                />
                <span style={css.asrModelName}>{opt.name}</span>
                <span style={css.asrModelSize}>{opt.sizeLabel}</span>
                {isCurrent && <span style={css.asrCurrentTag}>当前</span>}
              </label>
            )
          })}
        </div>
      )}
      <div style={css.asrActions}>
        {!installed ? (
          <Button variant="outline" size="sm" disabled={busy || selectedModel === ''}
            onClick={() => void install(selectedModel)}>
            {busy ? '…' : t('asr.local.install')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={busy || !canSwitch}
            onClick={() => { if (canSwitch) void install(selectedModel) }}>
            {busy ? '…' : canSwitch ? '换装模型' : t('asr.local.readyBadge')}
          </Button>
        )}
      </div>
    </div>
  )
}

/** 颜色。 */
const green = 'var(--dsw-alias-state-success-primary)'
const gray = 'var(--dsw-alias-label-tertiary)'

/** 一个大按钮（并排）：图标 + 标签 + 标题 + 状态灯。 */
function ModelTypeButton({ icon, label, tag, configured, active, onClick }: {
  icon: ReactNode
  label: string
  tag?: string
  configured: boolean
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={configured ? `${label}（已配置）` : `${label}（未配置，点击设置）`}
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '14px 10px',
        border: `1px solid ${active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
        borderRadius: 12,
        background: active ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, var(--dsw-alias-bg-layer-1))' : 'var(--dsw-alias-bg-layer-1)',
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-primary)',
        transition: 'border-color .12s ease, background .12s ease',
      }}
    >
      {tag !== undefined && (
        <span
          style={{
            position: 'absolute',
            top: -6,
            right: 8,
            fontSize: 10,
            lineHeight: '16px',
            fontWeight: 600,
            color: tag === '必填' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)',
            background: 'var(--dsw-alias-bg-layer-3)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 4,
            padding: '0 6px',
          }}
        >
          {tag}
        </span>
      )}
      <span style={{ fontSize: 22, lineHeight: 1, display: 'grid', placeItems: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, lineHeight: '18px', fontWeight: 600 }}>{label}</span>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          background: configured ? green : gray,
          boxShadow: configured ? `0 0 6px ${green}` : 'none',
        }}
      />
    </button>
  )
}

/** Lucide-style icons (24×24, 2px stroke, round caps, no fill). */
function LucideIcon({ d, size = 20 }: { d: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {d}
    </svg>
  )
}

/** Lucide Image (picture frame + landscape + sun). */
const LucideImage = ({ size }: { size?: number }) => (
  <LucideIcon size={size} d={<>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="2" />
    <path d="m21 15-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>} />
)

/** Lucide Volume2 (speaker + sound waves). */
const LucideVolume2 = ({ size }: { size?: number }) => (
  <LucideIcon size={size} d={<>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>} />
)

/** Lucide Mic (microphone + stand). */
const LucideMic = ({ size }: { size?: number }) => (
  <LucideIcon size={size} d={<>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" x2="12" y1="19" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </>} />
)

/** The model-configuration body: 3 个大按钮并排，点击展开对应设置。 */
export function ModelSettingsSection(props: ModelSettingsInjected) {
  const { api, t, listModels, testVision, testAudio, asrStatus, asrInstall, pluginSettings } = props
  const [, forceRender] = useState(0)
  const [openPanel, setOpenPanel] = useState<'vision' | 'audio' | 'asr' | null>(null)
  const [status, setStatus] = useState<{ vision: boolean; audio: boolean; asrAvail?: boolean }>({ vision: false, audio: false })

  // 订阅设置变化，刷新按钮状态灯。
  useEffect(() => {
    const refresh = (): void => {
      void (async () => {
        try {
          const res = await pluginSettings.describe()
          if (!res.ok) return
          const namespaces = res.namespaces
          const vision = namespaces.find(n => n.ns === 'vision')?.value as { providers?: Array<{ enabled?: boolean }> } | undefined
          const audio = namespaces.find(n => n.ns === 'looklook-audio')?.value as { providers?: Array<{ enabled?: boolean }> } | undefined
          const asr = await asrStatus().catch(() => null)
          setStatus({
            vision: (vision?.providers ?? []).some(p => p.enabled !== false),
            audio: (audio?.providers ?? []).some(p => p.enabled !== false),
            asrAvail: asr?.installed ?? false,
          })
        } catch {
          // 忽略：保持上次状态
        }
      })()
    }
    refresh()
    return pluginSettings.subscribe(() => { refresh(); forceRender(n => n + 1) })
  }, [pluginSettings, asrStatus])

  const toggle = (panel: 'vision' | 'audio' | 'asr'): void => {
    setOpenPanel(current => current === panel ? null : panel)
  }

  return (
    <div style={css.stack}>
      {/* 3 个大按钮并排 */}
      <div style={{ display: 'flex', gap: 10 }}>
        <ModelTypeButton
          icon={<LucideImage size={22} />}
          label={t('settings.vision.short')}
          tag="必填"
          configured={status.vision}
          active={openPanel === 'vision'}
          onClick={() => toggle('vision')}
        />
        <ModelTypeButton
          icon={<LucideVolume2 size={22} />}
          label={t('settings.audio.short')}
          tag="选填"
          configured={status.audio}
          active={openPanel === 'audio'}
          onClick={() => toggle('audio')}
        />
        <ModelTypeButton
          icon={<LucideMic size={22} />}
          label={t('asr.local.short')}
          tag="选填"
          configured={status.asrAvail ?? false}
          active={openPanel === 'asr'}
          onClick={() => toggle('asr')}
        />
      </div>

      {/* 点击按钮展开对应设置 */}
      {openPanel === 'vision' && (
        <ProviderListEditor
          api={api}
          pluginSettings={pluginSettings}
          t={t}
          ns="vision"
          title={t('settings.vision.title')}
          intro={t('settings.vision.intro')}
          listModels={listModels}
          testModel={testVision}
          testLabel="测试看图能力"
        />
      )}
      {openPanel === 'audio' && (
        <ProviderListEditor
          api={api}
          pluginSettings={pluginSettings}
          t={t}
          ns="looklook-audio"
          title={t('settings.audio.title')}
          intro={t('settings.audio.intro')}
          listModels={listModels}
          testModel={testAudio}
          testLabel="测试音频能力"
        />
      )}
      {openPanel === 'asr' && (
        <LocalAsrCard asrStatus={asrStatus} asrInstall={asrInstall} t={t} />
      )}
    </div>
  )
}
