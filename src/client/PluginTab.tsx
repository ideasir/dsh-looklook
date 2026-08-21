/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
 * collapsible card chrome as the agent-loop / bash / web-search cards:
 * a header (title + description + chevron) that discloses:
 * - the feature switches (识别图像 / 识别视频);
 * - the model configuration (视觉模型 + 音频模型 + 本地 ASR 一键安装),
 *   visible while 识别图像 is ON.
 */

import { useEffect, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginSettingsClient } from './plugin-settings.ts'
import { Button, IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureController, FeatureState } from './feature-controller.ts'
import { LooklookFeaturesSection, type FeaturesInjected } from './Features.tsx'
import { ModelSettingsSection, type ModelSettingsInjected } from './VisionSettings.tsx'
import { EnvCheckDialog, type EnvCheckInjected } from './EnvCheck.tsx'
import type { EnvCheckItem, EnvCheckReport, CapabilityReport } from './upload-shared.ts'

/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
  /** The wire API client for model discovery. */
  api: IApiClient
  /** Plugin-owned settings and credential RPCs. */
  pluginSettings: PluginSettingsClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (image / video toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: ModelSettingsInjected['listModels']
  /** Probe whether one vision provider can actually see images. */
  testVision: ModelSettingsInjected['testVision']
  /** Probe one audio provider's capability level (L1/L2/none). */
  testAudio: ModelSettingsInjected['testAudio']
  /** Read the local ASR install state through the authorized RPC. */
  asrStatus: ModelSettingsInjected['asrStatus']
  /** Trigger the local ASR install through the authorized RPC. */
  asrInstall: ModelSettingsInjected['asrInstall']
  /** Run the environment self-check. */
  envCheck: () => Promise<EnvCheckReport>
  /** One-click repair for one env item. */
  envRepair: (action: 'install-yt-dlp' | 'install-asr') => Promise<EnvCheckItem>
  /** 功能能力自检。 */
  capabilityCheck: () => Promise<CapabilityReport>
  /** 获取插件版本号。 */
  getPluginVersion: () => Promise<string>
  /** 检查 GitHub 是否有更新。 */
  checkUpdate: () => Promise<{ hasUpdate: boolean; remoteVersion: string }>
  /** 卸载插件。 */
  uninstallPlugin: () => Promise<{ ok: boolean; error?: string }>
  /** Reactive plugin master switch (gates the model sections). */
  usePluginEnabled: () => boolean
}

const css = {
  card: {
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-3)',
    borderRadius: 10,
    minWidth: 0,
    overflow: 'hidden',
    listStyle: 'none',
  } as const,
  header: {
    boxSizing: 'border-box' as const,
    width: '100%',
    minHeight: 52,
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
  },
  headText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  name: { fontSize: 14, lineHeight: '20px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  desc: { fontSize: 12, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)' },
  chevron: { color: 'var(--dsw-alias-label-tertiary)', flex: 'none' },
  body: {
    borderTop: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-module-platform)',
    padding: '14px 14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  } as const,
} as const

/** The plugin-configuration card body. */
export function LooklookPluginCard(props: LooklookCardInjected) {
  const { api, pluginSettings, t, features, useFeatures, listModels, testVision, testAudio, asrStatus, asrInstall, envCheck, envRepair, capabilityCheck, getPluginVersion, checkUpdate, uninstallPlugin, usePluginEnabled } = props
  const [open, setOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  // Hook order stays stable: both hooks run before any conditional return.
  const pluginEnabled = usePluginEnabled()
  const featuresProps: FeaturesInjected = { api, t, features, useFeatures, capabilityCheck }
  const modelProps: ModelSettingsInjected = { api, pluginSettings, t, listModels, testVision, testAudio, asrStatus, asrInstall }
  const envProps: EnvCheckInjected = { t, envCheck, envRepair }
  const title = t('card.title')

  const refreshMeta = (): void => {
    void (async () => {
      const v = await getPluginVersion()
      setVersion(v)
      const upd = await checkUpdate()
      setHasUpdate(upd.hasUpdate)
    })()
  }

  useEffect(() => { refreshMeta() }, [getPluginVersion, checkUpdate])

  const handleUninstall = (): void => {
    if (uninstalling) return
    if (!window.confirm('确定卸载 Look Look 插件吗？\n\n将从 DSH 中移除插件本体和全部配置。')) return
    setUninstalling(true)
    setFeedback(null)
    void (async () => {
      const result = await uninstallPlugin()
      if (result.ok) {
        setFeedback('已卸载。请重启 DSH 使生效（插件配置文件中已移除）。')
      } else {
        setFeedback(`卸载失败：${result.error ?? '未知错误'}`)
        setUninstalling(false)
      }
    })()
  }

  return (
    <li style={css.card}>
      <button
        type="button"
        style={css.header}
        aria-expanded={open}
        aria-label={`${t(open ? 'card.collapse' : 'card.expand')}: ${title}`}
        onClick={() => setOpen(!open)}
      >
        <span style={css.headText}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={css.name}>{title}</span>
            {version !== '' && (
              <span
                title={`当前版本 ${version}`}
                style={{
                  fontSize: 11,
                  lineHeight: '16px',
                  fontWeight: 500,
                  color: 'var(--dsw-alias-label-secondary)',
                  background: 'var(--dsw-alias-bg-layer-1)',
                  border: '1px solid var(--dsw-alias-border-l2)',
                  borderRadius: 999,
                  padding: '0 8px',
                  flex: 'none',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {version}
              </span>
            )}
          </span>
          <span style={css.desc}>{t('card.desc')}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          {/* ideasir 直达仓库 */}
          <a
            href="https://github.com/ideasir/dsh-looklook"
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            title="打开 GitHub 仓库"
            style={{
              fontSize: 12,
              lineHeight: '18px',
              fontWeight: 500,
              color: 'var(--dsw-alias-label-secondary)',
              textDecoration: 'none',
              background: 'var(--dsw-alias-bg-layer-1)',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 999,
              padding: '2px 10px',
              whiteSpace: 'nowrap',
              transition: 'color .12s ease, border-color .12s ease, background .12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--dsw-alias-brand-primary)'
              e.currentTarget.style.borderColor = 'var(--dsw-alias-brand-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'
              e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)'
            }}
          >
            ideasir
          </a>
          {/* 卸载（红色） */}
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); handleUninstall() }}
            disabled={uninstalling}
            title="卸载插件"
            style={{
              fontSize: 12,
              lineHeight: '18px',
              fontWeight: 500,
              color: 'var(--dsw-alias-state-error-primary)',
              background: 'var(--dsw-alias-bg-layer-1)',
              border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)',
              borderRadius: 999,
              padding: '2px 10px',
              cursor: uninstalling ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: uninstalling ? 0.6 : 1,
              transition: 'background .12s ease, border-color .12s ease',
            }}
            onMouseEnter={(e) => {
              if (uninstalling) return
              e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)'
            }}
          >
            {uninstalling ? '卸载中…' : '卸载'}
          </button>
          {/* 更新（无更新灰 / 有更新绿） */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              // 有更新时跳转到仓库（安装/更新指引）；无更新时重新检查
              if (hasUpdate) {
                window.open('https://github.com/ideasir/dsh-looklook', '_blank', 'noreferrer')
              } else {
                refreshMeta()
              }
            }}
            title={hasUpdate ? '发现新版本，点击前往仓库查看更新' : '当前已是最新版本（点击重新检查）'}
            style={{
              fontSize: 12,
              lineHeight: '18px',
              fontWeight: 500,
              color: hasUpdate ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)',
              background: 'var(--dsw-alias-bg-layer-1)',
              border: `1px solid ${hasUpdate
                ? 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)'
                : 'var(--dsw-alias-border-l2)'}`,
              borderRadius: 999,
              padding: '2px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background .12s ease, border-color .12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)'
            }}
          >
            {hasUpdate ? '有更新' : '已最新'}
          </button>
          {/* 环境检测 */}
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => { event.stopPropagation(); setEnvOpen(true) }}
            aria-label={t('env.checkButton')}
          >
            {t('env.checkButton')}
          </Button>
          <span style={{ ...css.chevron, display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .14s ease-in-out' }}>
            <IconChevronDownOutline14 />
          </span>
        </span>
      </button>
      {open && (
        <div style={css.body}>
          {feedback !== null && (
            <p style={{ margin: 0, fontSize: 13, color: feedback.startsWith('已卸载') ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>
              {feedback}
            </p>
          )}
          <LooklookFeaturesSection {...featuresProps} />
          {pluginEnabled && (
            <>
              <div style={{ border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)' }} />
              <ModelSettingsSection {...modelProps} />
            </>
          )}
        </div>
      )}
      {envOpen && (
        <EnvCheckDialog {...envProps} onClose={() => setEnvOpen(false)} />
      )}
    </li>
  )
}
