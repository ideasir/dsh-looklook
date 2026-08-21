/**
 * ModelSettings — the looklook "模型配置" section inside the plugin card:
 * - 视觉模型: recognizes images AND video frames (video = frames → image).
 *   Primary + fallbacks with automatic failover.
 * - 音频模型: transcript + sound understanding in one config; the plugin
 *   probes the model's capability at use time (no user label needed).
 *
 * Both lists reuse {@link ProviderListEditor}.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginSettingsClient } from './plugin-settings.ts'
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
}

const css = {
  stack: { display: 'flex', flexDirection: 'column', gap: 28, color: 'var(--dsw-alias-label-primary)' },
  divider: { border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)' },
} as const

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

/** The model-configuration body: 2 个大按钮并排，点击展开对应设置。 */
export function ModelSettingsSection(props: ModelSettingsInjected) {
  const { api, t, listModels, testVision, testAudio, pluginSettings } = props
  const [, forceRender] = useState(0)
  const [openPanel, setOpenPanel] = useState<'vision' | 'audio' | null>(null)
  const [status, setStatus] = useState<{ vision: boolean; audio: boolean }>({ vision: false, audio: false })

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
          setStatus({
            vision: (vision?.providers ?? []).some(p => p.enabled !== false),
            audio: (audio?.providers ?? []).some(p => p.enabled !== false),
          })
        } catch {
          // 忽略：保持上次状态
        }
      })()
    }
    refresh()
    return pluginSettings.subscribe(() => { refresh(); forceRender(n => n + 1) })
  }, [pluginSettings])

  const toggle = (panel: 'vision' | 'audio'): void => {
    setOpenPanel(current => current === panel ? null : panel)
  }

  return (
    <div style={css.stack}>
      {/* 2 个大按钮并排 */}
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
    </div>
  )
}
