/**
 * FileChips: pending archive/video attachments rendered in the composer dock
 * — one chip per staged file (icon + name + size), a delete × on hover.
 * The files are already uploaded; pressing Enter merges their path notes into
 * the outgoing message (the submit wrapper in index.ts).
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PendingFilesController, PendingFilesState } from './pending-files.ts'

/** Injected face supplied by the plugin apply closure. */
export interface FileChipsInjected {
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Pending-files controller. */
  pending: PendingFilesController
  /** Reactive snapshot of the pending store. */
  usePending: (selector: (state: PendingFilesState) => unknown) => unknown
  /** The current session id (injected by the slot owner). */
  sessionId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** One chip card (hover reveals the remove ×). */
export function FileChips(props: FileChipsInjected) {
  const { t, pending, usePending, sessionId } = props
  const files = usePending((state: PendingFilesState) => state[sessionId] ?? []) as
    | ReturnType<PendingFilesController['get']>
    | undefined
  const list = files ?? []
  if (list.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {list.map((file, index) => (
        <span
          key={file.path}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 260,
            padding: '3px 8px 3px 6px',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 8,
            background: 'var(--dsw-alias-bg-layer-2)',
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-primary)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3l6 6h-4v8h-4v-8H6l6-6z" fill="currentColor" />
            <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name} <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{formatSize(file.size)}</span>
          </span>
          <button
            type="button"
            aria-label={`${t('upload.remove')}: ${file.name}`}
            onClick={() => pending.remove(sessionId, index)}
            style={{
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              width: 16,
              height: 16,
              border: 'none',
              borderRadius: 999,
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--dsw-alias-label-tertiary)',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
