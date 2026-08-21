/**
 * FileChips: pending upload attachments rendered above the composer.
 * Files are staged here; pressing Enter sends them.
 * - Images: 30px thumbnail, click opens lightbox, hover shows dimensions + size
 * - Videos: 30px thumbnail with play icon, click plays, hover shows size
 * - Other files: 30px Lucide icon, hover shows name + size
 */

import { useEffect, useRef, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { PendingFilesController, PendingFilesState } from './pending-files.ts'
import { formatSize } from './upload-shared.ts'
import { FileTypeIcon } from './FileTypeIcon.tsx'
import { ImageLightbox, type ImageLightboxLabels } from './lightbox.tsx'
import { VideoPlayer } from './video-player.tsx'

/** Injected face supplied by the plugin apply closure. */
export interface FileChipsInjected {
  t: TranslateNS<'looklook'>
  pending: PendingFilesController
  usePending: (selector: (state: PendingFilesState) => unknown) => unknown
  sessionId: string
}

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|mpg|mpeg)$/i

function isVideoName(name: string): boolean {
  return VIDEO_EXT_RE.test(name)
}

const CHIP_SIZE = 30

const LIGHTBOX_LABELS: ImageLightboxLabels = { dialog: '图片预览', close: '关闭预览' }

export function FileChips(props: FileChipsInjected) {
  const { pending, usePending, sessionId } = props
  const files = usePending((state: PendingFilesState) => state[sessionId]) as
    | ReturnType<PendingFilesController['get']>
    | undefined
  const list = files ?? []
  const previewUrls = useRef(new Set<string>())
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
        margin: '0 auto',
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
          style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}
          onMouseEnter={() => setHoveredId(file.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <span
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: CHIP_SIZE,
              height: CHIP_SIZE,
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--dsw-alias-bg-layer-2)',
              border: '1px solid var(--dsw-alias-border-l2)',
              cursor: file.previewUrl !== undefined && file.uploading !== true ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (file.uploading === true || file.previewUrl === undefined) return
              if (isVideoName(file.name)) {
                setPlayingUrl(file.previewUrl)
              } else {
                setLightboxSrc(file.previewUrl)
              }
            }}
          >
            {file.uploading === true ? (
              <span style={{
                position: 'relative',
                display: 'grid',
                placeItems: 'center',
                width: '100%',
                height: '100%',
              }}>
                <svg width="100%" height="100%" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ position: 'absolute', animation: 'looklook-spin 0.8s linear infinite' }}>
                  <circle cx="14" cy="14" r="11" stroke="var(--dsw-alias-border-l3)" strokeWidth="2.5" />
                  <circle cx="14" cy="14" r="11" stroke="var(--dsw-alias-brand-primary)" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 11}`}
                    strokeDashoffset={`${2 * Math.PI * 11 * (1 - (file.progress ?? 0) / 100)}`}
                    transform="rotate(-90 14 14)" />
                </svg>
                <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' }}>
                  {file.progress ?? 0}%
                </span>
              </span>
            ) : file.previewUrl !== undefined ? (
              isVideoName(file.name) ? (
                <video src={file.previewUrl} preload="metadata" muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <img src={file.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )
            ) : (
              <span style={{ display: 'grid', placeItems: 'center', color: 'var(--dsw-alias-brand-primary)' }}>
                <FileTypeIcon name={file.name} size={22} />
              </span>
            )}
            {/* Close × on hover */}
            <button
              type="button"
              aria-label={`移除: ${file.name}`}
              onClick={(e) => { e.stopPropagation(); pending.remove(sessionId, file.id) }}
              style={{
                position: 'absolute',
                top: 1,
                right: 1,
                display: 'grid',
                placeItems: 'center',
                width: 14,
                height: 14,
                border: 'none',
                borderRadius: 999,
                background: 'rgba(0,0,0,0.55)',
                cursor: 'pointer',
                color: '#fff',
                padding: 0,
                lineHeight: 1,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </span>
          {/* Tooltip on hover */}
          {hoveredId === file.id && file.uploading !== true && (
            <span
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: '50%',
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                fontSize: 11,
                lineHeight: '16px',
                color: 'var(--dsw-alias-label-primary)',
                background: 'var(--dsw-alias-bg-layer-2)',
                border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 6,
                padding: '3px 8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              {file.previewUrl !== undefined && isVideoName(file.name)
                ? formatSize(file.size)
                : file.previewUrl !== undefined
                  ? `${file.size > 0 ? formatSize(file.size) : file.name}`
                  : `${file.name} · ${formatSize(file.size)}`}
            </span>
          )}
        </span>
      ))}
    </div>
    </div>
    {lightboxSrc !== null && (
      <ImageLightbox src={lightboxSrc} alt="" labels={LIGHTBOX_LABELS} onClose={() => setLightboxSrc(null)} />
    )}
    {playingUrl !== null && (
      <VideoPlayer src={playingUrl} onClose={() => { setPlayingUrl(null); URL.revokeObjectURL(playingUrl) }} />
    )}
    </>
  )
}