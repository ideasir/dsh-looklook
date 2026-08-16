/**
 * LooklookFeatures: the master-switch controls inside the looklook plugin
 * card. Two slider-style switches:
 * - 识别图像 — ON enables plugin image recognition (file channel);
 * - 识别视频 — ON enables video analysis (frames + audio).
 */

import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeatureController, FeatureState } from './feature-controller.ts'

/** Injected face supplied by the plugin apply closure. */
export interface FeaturesInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Feature controller (image / video recognition toggles). */
  features: FeatureController
  /** Reactive snapshot of the feature switches. */
  useFeatures: () => FeatureState
}

const css = {
  stack: { display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--dsw-alias-label-primary)' },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  heading: {
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.02em',
  },
  row: { display: 'flex', alignItems: 'center', gap: 14 },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  rowName: { fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  rowDesc: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  hint: { fontSize: 11, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)' },
} as const

/** Slider-style switch (track + knob), smooth spring motion, perfectly centered knob. */
function SliderSwitch({ checked, onChange, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  const trackW = 44
  const trackH = 24
  const knob = 18
  const pad = 3
  const knobTop = (trackH - knob) / 2
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
        width: trackW,
        height: trackH,
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
          top: knobTop,
          left: checked ? trackW - knob - pad : pad,
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

/** The master-switch body. */
export function LooklookFeaturesSection(props: FeaturesInjected) {
  const { t, features, useFeatures } = props
  const state = useFeatures()
  const ready = state.status === 'ready'

  return (
    <div style={css.stack}>
      <div style={css.section}>
        <span style={css.heading}>{t('features.switches.heading')}</span>
        <SwitchRow
          label={t('features.image.label')}
          desc={t('features.image.desc')}
          checked={ready && state.imageRecognition}
          onChange={next => features.setImageRecognition(next)}
        />
        <SwitchRow
          label={t('features.video.label')}
          desc={t('features.video.desc')}
          checked={ready && state.videoRecognition}
          onChange={next => features.setVideoRecognition(next)}
        />
        <span style={css.hint}>{t('features.uploadHint')}</span>
      </div>
    </div>
  )
}
