/**
 * LooklookFeatures: the plugin master-switch settings section
 * (`settings.section`). Renders:
 * - 开启多模态 — master switch for the vision feature; when OFF the plugin is
 *   invisible to images (native DSH behavior) and the vision-model section is
 *   hidden.
 * - 开启 ZIP — master switch for the process_zip tool and archive uploads.
 * - 安装支持 — 7z CLI install button (host apt install, user-triggered).
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
  /** Feature controller (multimodal / zip toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
}

const layout = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' },
  title: { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  intro: { margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)' },
  hint: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-warn-label)' },
  card: {
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  row: { display: 'flex', alignItems: 'center', gap: 12 },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowName: { fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  rowDesc: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
} as const

/** One switch row. */
function SwitchRow({ label, desc, checked, onChange, t }: {
  label: string
  desc: string
  checked: boolean
  onChange: (next: boolean) => void
  t: TranslateNS<'looklook'>
}) {
  return (
    <div style={layout.row}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', minWidth: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          style={{ flex: 'none' }}
        />
        <span style={layout.rowText}>
          <span style={layout.rowName}>{label}</span>
          <span style={layout.rowDesc}>{desc}</span>
        </span>
      </label>
    </div>
  )
}

/** The plugin settings section body. */
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
    features.load()
    void refreshSevenZ()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features])

  const ready = state.status === 'ready'

  return (
    <div style={layout.section}>
      <h2 style={layout.title}>{t('features.nav')}</h2>
      <p style={layout.intro}>{t('features.intro')}</p>

      <div style={layout.card}>
        <SwitchRow
          label={t('features.multimodal.label')}
          desc={t('features.multimodal.desc')}
          checked={ready && state.multimodal}
          onChange={next => features.setMultimodal(next)}
          t={t}
        />
        <SwitchRow
          label={t('features.zip.label')}
          desc={t('features.zip.desc')}
          checked={ready && state.zip}
          onChange={next => features.setZip(next)}
          t={t}
        />
      </div>

      <div style={layout.card}>
        <div style={layout.rowName}>{t('features.install.header')}</div>
        <div style={layout.rowDesc}>{t('features.install.desc')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
          {sevenZ.status === 'error' && <span style={layout.error}>{sevenZ.message}</span>}
        </div>
        {sevenZ.status === 'ready' && !sevenZ.installed && (
          <span style={layout.hint}>{t('features.install.missingHint')}</span>
        )}
      </div>
    </div>
  )
}
