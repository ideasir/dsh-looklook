/**
 * LooklookFeatures: the plugin card's body:
 * - a master switch (开启看看 / 关闭：DSH 恢复原样);
 * - a "支持格式" grid listing every content type the plugin understands,
 *   each with an icon;
 * - a compact "支持视频平台" line (抖音 / B站 / YouTube / 西瓜 / 更多 yt-dlp
 *   支持的平台).
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
  /** Feature controller (master switch). */
  features: FeatureController
  /** Reactive snapshot of the master switch. */
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 },
  typeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  typeIcon: { flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--dsw-alias-brand-primary)', fontSize: 18 },
  typeName: { fontSize: 12, lineHeight: '18px', fontWeight: 500 },
  platforms: { fontSize: 11, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', display: 'flex', flexWrap: 'wrap', gap: '2px 8px' },
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

/** One supported content type with an emoji icon. */
const SUPPORTED_TYPES: Array<{ icon: string; name: string }> = [
  { icon: '🖼️', name: '图片 / 图像' },
  { icon: '🎬', name: '视频' },
  { icon: '🔊', name: '声音' },
  { icon: '🎨', name: 'PSD' },
  { icon: '📄', name: 'DOC' },
  { icon: '📊', name: 'Excel' },
  { icon: '📽️', name: 'PPT' },
  { icon: '📕', name: 'PDF' },
]

/** Supported video platforms (compact list under the format grid). */
const SUPPORTED_PLATFORMS = ['抖音', 'B 站', 'YouTube', '西瓜视频', '快手', '微博视频', '优酷', '腾讯视频', '爱奇艺', '更多 yt-dlp 支持的平台']

/** The plugin-card body. */
export function LooklookFeaturesSection(props: FeaturesInjected) {
  const { t, features, useFeatures } = props
  const state = useFeatures()
  const ready = state.status === 'ready'
  const enabled = ready && state.enabled

  return (
    <div style={css.stack}>
      <div style={css.section}>
        <span style={css.heading}>{t('features.switches.heading')}</span>
        <div style={css.row}>
          <SliderSwitch
            checked={enabled}
            onChange={next => features.setEnabled(next)}
            label={t('features.master.label')}
          />
          <span style={css.rowText}>
            <span style={css.rowName}>{t('features.master.label')}</span>
            <span style={css.rowDesc}>{t('features.master.desc')}</span>
          </span>
        </div>
      </div>

      <div style={css.section}>
        <span style={css.heading}>{t('features.supported.heading')}</span>
        <div style={css.grid}>
          {SUPPORTED_TYPES.map(type => (
            <div key={type.name} style={css.typeCard}>
              <span style={css.typeIcon}>{type.icon}</span>
              <span style={css.typeName}>{type.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={css.section}>
        <span style={css.heading}>{t('features.platforms.heading')}</span>
        <div style={css.platforms}>
          {SUPPORTED_PLATFORMS.map((platform, index) => (
            <span key={platform}>
              {index > 0 && <span style={{ color: 'var(--dsw-alias-border-l3)' }}> · </span>}
              {platform}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
