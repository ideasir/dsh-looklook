/**
 * LooklookFeaturesSection: 改版后的设置面板主体。
 * - 主开关「开关插件」
 * - 功能检测区：标题「功能检测」+「全部检测」按钮 + 6 行检测项
 *   （识别图像 / 识别视频 / 识别声音 / 识别 PSD / 识别 Office / 支持视频平台）
 * - 成功绿色，失败红色 + 原因
 *
 * rc.8 适配：
 * - 去掉原来的「支持的文件格式」grid 和「支持视频平台」列表
 * - 环境检测按钮移到卡片右上角（PluginTab 里）
 */

import { useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { FeatureController, FeatureState } from './feature-controller.ts'
import type { CapabilityItem, CapabilityReport } from './upload-shared.ts'

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
  /** 功能能力自检。 */
  capabilityCheck: () => Promise<CapabilityReport>
}

const css = {
  stack: { display: 'flex', flexDirection: 'column', gap: 14, color: 'var(--dsw-alias-label-primary)' },
  section: { display: 'flex', flexDirection: 'column', gap: 10 } as const,
  heading: {
    fontSize: 12,
    lineHeight: '18px',
    fontWeight: 600,
    color: 'var(--dsw-alias-label-secondary)',
    letterSpacing: '0.02em',
  } as const,
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  } as const,
  row: { display: 'flex', alignItems: 'center', gap: 14 },
  rowText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 },
  rowName: { fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  rowDesc: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  hint: { fontSize: 11, lineHeight: '17px', color: 'var(--dsw-alias-label-tertiary)' },
  /** 检测项卡片。 */
  checkItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-1)',
  } as const,
  checkDot: { width: 8, height: 8, borderRadius: 999, flex: 'none', marginTop: 6 },
  checkLabel: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  checkReason: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 2, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const },
  checkBody: { flex: 1, minWidth: 0 },
  /** 颜色值。 */
  green: 'var(--dsw-alias-state-success-primary)',
  red: 'var(--dsw-alias-state-error-primary)',
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
        background: checked ? css.green : 'var(--dsw-alias-border-l3)',
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

/** 一行检测项（单行显示，label + 状态 + 原因）。 */
function CheckRow({ item }: { item: CapabilityItem }) {
  const color = item.status === 'ok' ? css.green : css.red
  return (
    <div style={css.checkItem}>
      <span style={{ ...css.checkDot, background: color }} />
      <div style={{ ...css.checkBody, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...css.checkLabel, color, whiteSpace: 'nowrap' as const }}>{item.label}</span>
        <span style={{ ...css.checkReason, color, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{item.errorReason}</span>
      </div>
    </div>
  )
}

/** 弹窗样式（与 EnvCheckDialog 一致）。 */
const dialogCss = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    boxSizing: 'border-box' as const,
    width: 'min(560px, 100%)',
    maxHeight: '80vh',
    overflow: 'auto',
    background: 'var(--dsw-alias-bg-layer-2)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 14,
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
  summary: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-tertiary)' },
  close: {
    color: 'var(--dsw-alias-label-secondary)',
    background: 'none',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 8,
    padding: '3px 12px',
    fontSize: 13,
    lineHeight: '18px',
    cursor: 'pointer',
  },
} as const

/** 功能检测结果弹窗。 */
function CapabilityCheckDialog({ report, error, onClose }: {
  report: CapabilityReport | null
  error: string | null
  onClose: () => void
}) {
  const failed = report?.items.filter(i => i.status === 'fail').length ?? 0
  const summary = report === null
    ? null
    : failed === 0
      ? '全部检测通过'
      : `${failed} 项未通过，详见下方原因。`
  return (
    <div style={dialogCss.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={dialogCss.dialog} role="dialog" aria-modal="true" aria-label="功能检测">
        <div style={dialogCss.header}>
          <h2 style={dialogCss.title}>功能检测</h2>
          <button type="button" style={dialogCss.close} onClick={onClose}>关闭</button>
        </div>
        {report !== null && summary !== null && <p style={{ ...dialogCss.summary, color: failed === 0 ? css.green : css.red }}>{summary}</p>}
        {error !== null && <p style={{ margin: 0, fontSize: 13, color: css.red }}>{error}</p>}
        {report !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* 前 5 行（功能检测）：图像/视频/声音/PSD/Office */}
            {report.items.slice(0, 5).map(item => (
              <CheckRow key={item.id} item={item} />
            ))}
            {/* 第 2 个标题：支持视频平台检测 */}
            <span style={{ ...css.heading, marginTop: 4 }}>支持视频平台检测</span>
            {/* 第 6 行：视频平台检测 */}
            {report.items[5] && <CheckRow item={report.items[5]} />}
          </div>
        )}
        {report === null && error === null && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>检测中…</p>
        )}
      </div>
    </div>
  )
}

/** The plugin-card body: master switch + capability check list. */
export function LooklookFeaturesSection(props: FeaturesInjected) {
  const { t, features, useFeatures, capabilityCheck } = props
  const state = useFeatures()
  const ready = state.status === 'ready'
  const enabled = ready && state.enabled

  const [capReport, setCapReport] = useState<CapabilityReport | null>(null)
  const [capChecking, setCapChecking] = useState(false)
  const [capError, setCapError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const runCapCheck = async (): Promise<void> => {
    setCapChecking(true)
    setCapError(null)
    setDialogOpen(true)
    try {
      setCapReport(await capabilityCheck())
    } catch (err) {
      setCapError(err instanceof Error ? err.message : String(err))
    } finally {
      setCapChecking(false)
    }
  }

  return (
    <div style={css.stack}>
      {/* 主开关 */}
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

      {/* 功能检测 */}
      <div style={css.section}>
        <div style={css.headingRow}>
          <span style={css.heading}>{t('features.capability.heading')}</span>
          <button
            type="button"
            onClick={() => void runCapCheck()}
            disabled={capChecking}
            style={{
              fontSize: 12,
              lineHeight: '18px',
              fontWeight: 500,
              color: capChecking ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-brand-primary)',
              background: 'none',
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: 999,
              padding: '2px 12px',
              cursor: capChecking ? 'default' : 'pointer',
              flex: 'none',
            }}
          >
            {capChecking ? '检测中…' : t('features.capability.checkAll')}
          </button>
        </div>

        {/* 检测结果改为弹窗，按钮下只保留提示文案 */}
        {!dialogOpen && capReport === null && capError === null && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
            {'点击「全部检测」检查各识别能力是否可用'}
          </p>
        )}
        {!dialogOpen && capError !== null && (
          <p style={{ margin: 0, fontSize: 13, color: css.red }}>
            {capError}
          </p>
        )}
      </div>

      {/* 检测结果弹窗 */}
      {dialogOpen && (
        <CapabilityCheckDialog
          report={capReport}
          error={capError}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}