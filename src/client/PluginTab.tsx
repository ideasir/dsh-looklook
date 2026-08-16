/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
 * collapsible card chrome as the agent-loop / bash / web-search cards:
 * a header (title + description + chevron) that discloses:
 * - the feature switches (识别图像 / 识别视频);
 * - the model configuration (视觉模型 + 音频模型 + 本地 ASR 一键安装),
 *   visible while 识别图像 is ON.
 */

import { useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureController, FeatureState } from './feature-controller.ts'
import { LooklookFeaturesSection, type FeaturesInjected } from './Features.tsx'
import { ModelSettingsSection, type ModelSettingsInjected } from './VisionSettings.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (image / video toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: ModelSettingsInjected['listModels']
  /** Reactive snapshot of the image recognition master switch. */
  useImageRecognition: () => boolean
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
  const { api, t, features, useFeatures, listModels, useImageRecognition } = props
  const [open, setOpen] = useState(false)
  // Hook order stays stable: both hooks run before any conditional return.
  const imageRecognitionOn = useImageRecognition()
  const featuresProps: FeaturesInjected = { api, t, features, useFeatures }
  const modelProps: ModelSettingsInjected = { api, t, listModels }
  const title = t('card.title')
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
          <span style={css.name}>{title}</span>
          <span style={css.desc}>{t('card.desc')}</span>
        </span>
        <span style={{ ...css.chevron, display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .14s ease-in-out' }}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open && (
        <div style={css.body}>
          <LooklookFeaturesSection {...featuresProps} />
          {imageRecognitionOn && (
            <>
              <div style={{ border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)' }} />
              <ModelSettingsSection {...modelProps} />
            </>
          )}
        </div>
      )}
    </li>
  )
}
