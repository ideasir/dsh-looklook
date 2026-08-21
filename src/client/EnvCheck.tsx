/**
 * EnvCheckDialog — the "环境检测" modal opened from the looklook plugin card.
 * Runs the host environment self-check (Python / ffmpeg / yt-dlp / yt-dlp)
 * and lists every item with status. Repairable items show a "一键修复" button
 * that calls the host repair RPC and refreshes that item's state.
 */

import { useEffect, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EnvCheckItem, EnvCheckReport } from './upload-shared.ts'

/** Injected face supplied by the plugin card. */
export interface EnvCheckInjected {
  t: TranslateNS<'looklook'>
  envCheck: () => Promise<EnvCheckReport>
  envRepair: (action: 'install-yt-dlp') => Promise<EnvCheckItem>
}

const css = {
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
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: 10,
    background: 'var(--dsw-alias-bg-layer-1)',
  },
  itemHead: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 999, flex: 'none', marginTop: 6 },
  itemLabel: { fontSize: 13, lineHeight: '20px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)' },
  itemDetail: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  guidance: { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  itemBody: { flex: 1, minWidth: 0 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 12 },
} as const

function statusColor(status: 'ok' | 'missing' | 'error'): string {
  if (status === 'ok') return 'var(--dsw-alias-state-success-primary)'
  if (status === 'error') return 'var(--dsw-alias-state-error-primary)'
  return 'var(--dsw-alias-state-warn-primary)'
}

function statusText(status: 'ok' | 'missing' | 'error'): string {
  if (status === 'ok') return '正常'
  if (status === 'error') return '异常'
  return '缺失'
}

/** One check row with its repair button. */
function CheckItemRow({ item, repairing, onRepair }: {
  item: EnvCheckItem
  repairing: boolean
  onRepair: (item: EnvCheckItem) => void
}) {
  return (
    <div style={css.item}>
      <span style={{ ...css.dot, background: statusColor(item.status) }} />
      <div style={css.itemBody}>
        <div style={css.itemHead}>
          <span style={css.itemLabel}>{item.label}</span>
          <span style={{ fontSize: 12, lineHeight: '18px', color: statusColor(item.status) }}>{statusText(item.status)}</span>
        </div>
        <div style={css.itemDetail}>{item.detail}</div>
        {item.guidance !== undefined && item.guidance !== '' && item.status !== 'ok' && (
          <div style={css.guidance}>{item.guidance}</div>
        )}
        {item.repairable && item.status !== 'ok' && item.repairAction !== undefined && (
          <div style={css.actions}>
            <Button variant="outline" size="sm" disabled={repairing} onClick={() => onRepair(item)}>
              {repairing ? '修复中…' : '一键修复'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The environment-check modal. */
export function EnvCheckDialog(props: EnvCheckInjected & { onClose: () => void }) {
  const { t, envCheck, envRepair, onClose } = props
  const [report, setReport] = useState<EnvCheckReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [repairing, setRepairing] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setError(null)
    try {
      setReport(await envCheck())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { void refresh() }, [envCheck])

  const repair = async (item: EnvCheckItem): Promise<void> => {
    if (item.repairAction === undefined) return
    setRepairing(item.id)
    try {
      const fresh = await envRepair(item.repairAction)
      // Replace the repaired item in the current report.
      setReport(current => current === null
        ? null
        : { ...current, items: current.items.map(i => i.id === fresh.id ? fresh : i) })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepairing(null)
    }
  }

  return (
    <div style={css.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={css.dialog} role="dialog" aria-modal="true" aria-label={t('env.dialogTitle')}>
        <div style={css.header}>
          <h2 style={css.title}>{t('env.dialogTitle')}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('env.close')}</Button>
        </div>
        {report !== null && <p style={css.summary}>{report.summary}</p>}
        {error !== null && <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>}
        {report !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {report.items.map(item => (
              <CheckItemRow key={item.id} item={item} repairing={repairing === item.id} onRepair={repair} />
            ))}
          </div>
        )}
        {report === null && error === null && (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>{t('env.checking')}</p>
        )}
        <div style={css.footer}>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>{t('env.refresh')}</Button>
        </div>
      </div>
    </div>
  )
}
