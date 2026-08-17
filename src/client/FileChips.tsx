/**
 * FileChips: pending archive/video attachments rendered in the composer dock
 * — one chip per staged file (icon + name + size), a delete × on hover.
 * The files are already uploaded; pressing Enter (or the send button) merges
 * their path notes into the outgoing message — the submit patch in index.ts
 * does the merge, so there is no separate "send attachment" action.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PendingFilesController, PendingFilesState } from './pending-files.ts'
import { formatSize } from './format.ts'
import { FileTypeIcon } from './FileTypeIcon.tsx'
import { useEffect, useRef } from 'react'

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

/** One chip card (hover reveals the remove ×). */
export function FileChips(props: FileChipsInjected) {
  const { t, pending, usePending, sessionId } = props
  // Selector returns the stable stored array (or undefined) — never allocate
  // a fresh value, or the reactive hook re-renders forever.
  const files = usePending((state: PendingFilesState) => state[sessionId]) as
    | ReturnType<PendingFilesController['get']>
    | undefined
  const list = files ?? []
  const previewUrls = useRef(new Set<string>())
  useEffect(() => {
    const current = new Set(list.map(file => file.previewUrl).filter((url): url is string => url !== undefined))
    for (const url of previewUrls.current) {
      if (!current.has(url)) URL.revokeObjectURL(url)
    }
    previewUrls.current = current
  }, [list])
  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url)
  }, [])
  if (list.length === 0) return null
  return (
    <>
    <style>{`@keyframes looklook-spin { to { transform: rotate(360deg); } }`}</style>
    <div
      style={{
        boxSizing: 'border-box',
        width: 'calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))',
        maxWidth: 'calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset))',
        margin: '0 auto calc(0px - var(--dsh-composer-stack-gap) - 3px)',
        padding: '0 var(--dsh-composer-dock-inset)',
        flex: 'none',
      }}
    >
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: '12px 12px 0 0',
        background: 'var(--dsw-specific-tip)',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderBottom: 'none',
      }}
    >
      {list.map((file) => (
        <span
          key={file.id}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 260,
            padding: '3px 8px 3px 6px',
            border: `1px solid ${file.error !== undefined ? 'var(--dsw-alias-state-warn-border, var(--dsw-alias-border-l2))' : 'var(--dsw-alias-border-l2)'}`,
            borderRadius: 8,
            background: 'var(--dsw-alias-bg-layer-2)',
            fontSize: 12,
            lineHeight: '18px',
            color: 'var(--dsw-alias-label-primary)',
          }}
        >
          {file.uploading === true ? (
            // Spinner + progress while uploading.
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              {file.previewUrl !== undefined && <img src={file.previewUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 5, flex: 'none' }} />}
              <span style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                flex: 'none',
                border: '2px solid var(--dsw-alias-border-l3)',
                borderTopColor: 'var(--dsw-alias-brand-primary)',
                animation: 'looklook-spin 0.8s linear infinite',
              }} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>上传中 {file.progress ?? 0}%</span>
                <span style={{
                  width: 120,
                  height: 3,
                  borderRadius: 2,
                  background: 'var(--dsw-alias-border-l2)',
                  overflow: 'hidden',
                  marginTop: 2,
                }}>
                  <span style={{
                    display: 'block',
                    height: '100%',
                    width: `${file.progress ?? 0}%`,
                    background: 'var(--dsw-alias-brand-primary)',
                    transition: 'width 0.2s ease',
                  }} />
                </span>
              </span>
            </span>
          ) : (
            <>
              {file.previewUrl !== undefined ? (
                <img src={file.previewUrl} alt="" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 5, flex: 'none' }} />
              ) : (
                <span style={{ display: 'grid', placeItems: 'center', flex: 'none', color: 'var(--dsw-alias-brand-primary)' }}>
                  <FileTypeIcon name={file.name} size={20} />
                </span>
              )}
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name} <span style={{ color: 'var(--dsw-alias-label-tertiary)' }}>{formatSize(file.size)}</span>
                </span>
                {file.error !== undefined && (
                  <span style={{ color: 'var(--dsw-alias-state-warn-label)', fontSize: 11 }}>{file.error}</span>
                )}
              </span>
            </>
          )}
          <button
            type="button"
            aria-label={`${t('upload.remove')}: ${file.name}`}
            onClick={() => pending.remove(sessionId, file.id)}
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
      <span style={{ marginLeft: 'auto', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }}>
        {t('upload.enterToSend')}
      </span>
    </div>
    </div>
    </>
  )
}
