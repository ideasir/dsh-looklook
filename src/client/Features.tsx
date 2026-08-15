/**
 * LooklookFeatures: the master-switch controls inside the looklook plugin
 * card. Two slider-style switches:
 * - 支持更多扩展名 — ON adds .7z / video to the upload whitelist (.zip stays);
 * - 支持多模态 — ON enables image recognition and shows the vision config.
 * Plus the 7z install support row.
 */

import { useEffect, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureController, FeatureState, SevenZState } from './feature-controller.ts'
import { fetchSevenZStatus, requestSevenZInstall } from './feature-controller.ts'

/** Injected face supplied by the plugin apply closure. */
export interface FeaturesInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (multimodal / moreExtensions toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
}

const css = {
  stack: { display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--dsw-alias-label-primary)' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowName: { fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  rowDesc: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  divider: { border: 'none', borderTop: '1px solid var(--dsw-alias-border-l2)', margin: '4px 0' },
  installRow: { display: 'flex', alignItems: 'center', gap: 10 },
  hint: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label)' },
} as const

/** Slider-style switch (track + knob), smooth spring motion. */
function SliderSwitch({ checked, onChange, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const size = 40
  const knob = size / 2 - 3
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        flex: 'none',
        position: 'relative',
        width: size,
        height: size / 2 + 4,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        background: checked ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-border-l3)',
        transition: 'background .18s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: checked ? 'inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent)' : 'none',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? size - knob - 2 : 2,
          width: knob,
          height: knob,
          borderRadius: 999,
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'left .2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
    </button>
  )
}

/** One switch row (slider left, label + description right). */
function SwitchRow({ label, desc, checked, onChange }: {
  label: string
  desc: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div style={css.row}>
      <SliderSwitch checked={checked} onChange={onChange} label={label} />
      <span style={css.rowText}>
        <span style={css.rowName}>{label}</span>
        <span style={css.rowDesc}>{desc}</span>
      </span>
    </div>
  )
}

/** The master-switch + install-support body. */
export function LooklookFeaturesSection(props: FeaturesInjected) {
  const { t, features, useFeatures } = props
  const state = useFeatures()
  const [sevenZ, setSevenZ] = useState<SevenZState>({ status: 'unknown' })

  const refreshSevenZ = async (): Promise<void> => {
    setSevenZ({ status: 'checking' })
    try {
      const { installed } = await fetchSevenZStatus()
      setSevenZ({ status: 'ready', installed })
    } catch (error) {
      setSevenZ({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  useEffect(() => {
    void refreshSevenZ()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ready = state.status === 'ready'

  return (
    <div style={css.stack}>
      <SwitchRow
        label={t('features.extensions.label')}
        desc={t('features.extensions.desc')}
        checked={ready && state.moreExtensions}
        onChange={next => features.setMoreExtensions(next)}
      />
      <SwitchRow
        label={t('features.multimodal.label')}
        desc={t('features.multimodal.desc')}
        checked={ready && state.multimodal}
        onChange={next => features.setMultimodal(next)}
      />

      <hr style={css.divider} />

      <div style={css.installRow}>
        <span style={css.rowText}>
          <span style={css.rowName}>{t('features.install.header')}</span>
          <span style={css.rowDesc}>{t('features.install.desc')}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={sevenZ.status === 'checking' || sevenZ.status === 'installing'}
          onClick={() => {
            if (sevenZ.status === 'ready' && sevenZ.installed) return
            void (async () => {
              setSevenZ({ status: 'installing' })
              try {
                const result = await requestSevenZInstall()
                setSevenZ({ status: 'ready', installed: result.installed })
              } catch (error) {
                setSevenZ({ status: 'error', message: error instanceof Error ? error.message : String(error) })
              }
            })()
          }}
        >
          {sevenZ.status === 'ready' && sevenZ.installed
            ? t('features.install.installed')
            : sevenZ.status === 'installing'
              ? t('features.install.installing')
              : sevenZ.status === 'checking'
                ? t('features.install.checking')
                : t('features.install.button')}
        </Button>
      </div>
      {sevenZ.status === 'error' && <span style={css.error}>{sevenZ.message}</span>}
      {sevenZ.status === 'ready' && !sevenZ.installed && (
        <span style={css.hint}>{t('features.install.missingHint')}</span>
      )}
    </div>
  )
}
