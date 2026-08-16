/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
 * collapsible card chrome as the agent-loop / bash / web-search cards:
 * a header (title + description + chevron) that discloses the controls:
 * - the master switches (多模态 / 更多扩展名);
 * - the vision-model configuration, visible while 多模态 is ON.
 */

import { useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureController, FeatureState } from './feature-controller.ts'
import { LooklookFeaturesSection, type FeaturesInjected } from './Features.tsx'
import { VisionSettingsSection, type VisionSettingsInjected } from './VisionSettings.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (multimodal / zip toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
  /** Probe one provider's `/models` endpoint through the host RPC. */
  listModels: VisionSettingsInjected['listModels']
  /** Reactive snapshot of the `multimodal` master switch. */
  useMultimodal: () => boolean
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
  const { api, t, features, useFeatures, listModels, useMultimodal } = props
  const [open, setOpen] = useState(false)
  // Hook order stays stable: both hooks run before any conditional return.
  const multimodalOn = useMultimodal()
  const featuresProps: FeaturesInjected = { api, t, features, useFeatures }
  const visionProps: VisionSettingsInjected = { api, t, listModels, useMultimodal }
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
          {multimodalOn && (
            <>
              <div style={{ border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)' }} />
              <VisionSettingsSection {...visionProps} />
            </>
          )}
        </div>
      )}
    </li>
  )
}
