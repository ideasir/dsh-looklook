/**
 * LooklookUserMessageNodeView — replaces the default user-message bubble so
 * the chat renders the ORIGINAL image the user sent, even though the session
 * record only carries the plugin's rewritten text (rc.6 rewrites the record).
 *
 * Thumbnail rule (fixed size): square → 220×220; landscape → height 220;
 * portrait → width 220 (aspect-preserving, never upscaled). Click opens the
 * native lightbox. The host embeds a full image-reference JSON in the marker
 * 「【附图:{...}】」 and wraps its model-facing tool-reference text in
 * 「【looklook:开始】…【looklook:结束】」 (hidden from the user). Defensive:
 * unexpected shapes fall back to plain text, never crashing the chat.
 */

import { useEffect, useState } from 'react'
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { ImageLoader, ImageLightboxLabels } from '@deepseek-ai/dsh-client-ui-attachment'
import { formatSize } from './format.ts'

/** The host's attachment marker: 「【附图:<ref-json-or-id>】」. */
const IMAGE_MARKER_RE = /【附图:([^】]+)】/g

/** Host hide delimiters: strip everything between them before display. */
const HIDE_START = '【looklook:开始】'
const HIDE_END = '【looklook:结束】'

/** Host file marker: 「【looklook:file】{json}【looklook:file】」. */
const FILE_MARKER_RE = /【looklook:file】([\s\S]*?)【looklook:file】/g

/** One staged file's metadata embedded in the marker. */
interface FileMeta {
  name: string
  path: string
  size: number
}

/** A rendered attachment card: icon + name + size. */
function FileCard({ file }: { file: FileMeta }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: 320,
        padding: '8px 12px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-2)',
        fontSize: 13,
        color: 'var(--dsw-alias-label-primary)',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l6 6h-4v8h-4v-8H6l6-6z" fill="currentColor" />
        <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{file.name}</span>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{formatSize(file.size)}</span>
      </span>
    </span>
  )
}

/** Thumbnail fixed dimension (short side cap). */
const THUMB_MAX = 220

/** Lightbox strings. */
const LIGHTBOX_LABELS: ImageLightboxLabels = { dialog: '图片预览', close: '关闭预览' }

/** Compute the thumbnail box: square 220×220; landscape height 220; portrait
 * width 220; never upscale (natural size when smaller). Missing metadata falls
 * back to a 220 square. */
function thumbSize(width?: number, height?: number): { width: number; height: number } {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: THUMB_MAX, height: THUMB_MAX }
  }
  const shortSide = Math.min(width, height)
  if (shortSide >= THUMB_MAX) {
    const scale = THUMB_MAX / shortSide
    return { width: Math.round(width * scale), height: Math.round(height * scale) }
  }
  return { width, height }
}

/** One fixed-size thumbnail with click-to-open lightbox. */
function LooklookThumb({ attachment, load }: { attachment: ImageAttachmentRef; load: ImageLoader }) {
  // NOTE: the prop is deliberately NOT named `ref` — React intercepts `ref`
  // as a special prop and the value never arrives, crashing the renderer.
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    setSrc(null)
    load(attachment).then((url) => { if (live) setSrc(url) }).catch(() => { /* unavailable */ })
    return () => { live = false }
  }, [attachment, load])
  const box = thumbSize(attachment.width, attachment.height)
  return (
    <>
      <button
        type="button"
        onClick={() => { if (src !== null) setOpen(true) }}
        aria-label="查看原图"
        style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', lineHeight: 0 }}
      >
        {src === null
          ? <div style={{ ...box, borderRadius: 8, background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 12, lineHeight: 1.4 }}>加载中…</div>
          : <img src={src} alt="图片" style={{ ...box, objectFit: 'cover', borderRadius: 8, display: 'block' }} />}
      </button>
      {open && src !== null && (
        <ImageLightbox src={src} alt="图片" labels={LIGHTBOX_LABELS} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/** Remove every host hidden range (tool references are model-facing only). */
function stripHidden(text: string): string {
  let out = text
  for (;;) {
    const start = out.indexOf(HIDE_START)
    if (start === -1) break
    const end = out.indexOf(HIDE_END, start)
    if (end === -1) {
      out = out.slice(0, start)
      break
    }
    out = out.slice(0, start) + out.slice(end + HIDE_END.length)
  }
  return out
}

/** Parse a marker payload: full ref JSON, or a bare attachmentId fallback. */
function parseMarkerRef(raw: string): ImageAttachmentRef {
  const trimmed = raw.trim()
  try {
    const parsed = JSON.parse(trimmed) as Partial<ImageAttachmentRef>
    if (typeof parsed?.attachmentId === 'string' && parsed.attachmentId.length > 0) {
      return {
        attachmentId: parsed.attachmentId,
        mediaType: typeof parsed.mediaType === 'string' ? parsed.mediaType as ImageAttachmentRef['mediaType'] : 'image/png' as ImageAttachmentRef['mediaType'],
        bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
        width: typeof parsed.width === 'number' ? parsed.width : 0,
        height: typeof parsed.height === 'number' ? parsed.height : 0,
      }
    }
  } catch {
    /* bare id fallback below */
  }
  return { attachmentId: trimmed } as ImageAttachmentRef
}

/** The host's image-reference JSON embedded in the hidden tool text. */
const REF_JSON_RE = /(\{"attachmentId":"[^"]+","mediaType":"[^"]+","bytes":\d+,"width":\d+,"height":\d+\})/g

/**
 * Collect every image reference embedded in the raw (pre-strip) text, keyed
 * by attachmentId. Lets legacy bare-id markers also render at their true
 * aspect ratio (the full ref lives in the hidden tool-reference text).
 */
function collectEmbeddedRefs(rawText: string): Map<string, ImageAttachmentRef> {
  const map = new Map<string, ImageAttachmentRef>()
  for (const match of rawText.matchAll(REF_JSON_RE)) {
    const raw = match[1]
    if (raw === undefined) continue
    try {
      const parsed = JSON.parse(raw) as Partial<ImageAttachmentRef>
      if (typeof parsed?.attachmentId === 'string' && parsed.attachmentId.length > 0) {
        map.set(parsed.attachmentId, {
          attachmentId: parsed.attachmentId,
          mediaType: typeof parsed.mediaType === 'string' ? parsed.mediaType as ImageAttachmentRef['mediaType'] : 'image/png' as ImageAttachmentRef['mediaType'],
          bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
          width: typeof parsed.width === 'number' ? parsed.width : 0,
          height: typeof parsed.height === 'number' ? parsed.height : 0,
        })
      }
    } catch {
      /* skip malformed ref */
    }
  }
  return map
}

interface ContentBlockLike {
  type?: string
  text?: unknown
  attachment?: { attachmentId?: unknown }
}

interface UserMessageNodeProps {
  node?: { data?: { content?: unknown } }
  loadImage?: (attachment: ImageAttachmentRef) => Promise<string>
}

/**
 * Defensive user-message renderer: fixed-size thumbnails + native lightbox,
 * only the user's own text shown; falls back to plain text on unexpected shapes.
 */
export function LooklookUserMessageNodeView(props: UserMessageNodeProps) {
  const content = props.node?.data?.content
  if (!Array.isArray(content)) {
    const fallback = (content as { text?: unknown } | null | undefined)?.text
    return typeof fallback === 'string'
      ? <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{fallback}</div>
      : null
  }
  const texts: string[] = []
  const attachments: ImageAttachmentRef[] = []
  const files: FileMeta[] = []
  const rawBlocks: string[] = []
  for (const raw of content) {
    const block = raw as ContentBlockLike
    if (block?.type === 'text' && typeof block.text === 'string') {
      rawBlocks.push(block.text)
      texts.push(stripHidden(block.text))
    } else if (block?.type === 'image' && typeof block.attachment?.attachmentId === 'string') {
      attachments.push(block.attachment as ImageAttachmentRef)
    }
  }
  const embeddedRefs = collectEmbeddedRefs(rawBlocks.join(''))
  const joined = texts.join('')
  const cleaned = joined
    .replace(FILE_MARKER_RE, (_all, payload: string) => {
      try {
        const parsed = JSON.parse(payload) as Partial<FileMeta>
        if (typeof parsed?.name === 'string' && typeof parsed?.path === 'string') {
          files.push({ name: parsed.name, path: parsed.path, size: typeof parsed.size === 'number' ? parsed.size : 0 })
        }
      } catch {
        /* skip malformed file marker */
      }
      return ''
    })
    .replace(IMAGE_MARKER_RE, (_all, payload: string) => {
      const parsed = parseMarkerRef(payload)
      const withMeta = embeddedRefs.get(parsed.attachmentId)
      attachments.push(withMeta ?? parsed)
      return ''
    })
  const trimmed = cleaned.trim()
  if (attachments.length === 0 && files.length === 0 && trimmed.length === 0) return null
  const load = props.loadImage ?? (() => Promise.reject(new Error('image loader unavailable')))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, margin: '8px 0' }}>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          {files.map((file, index) => <FileCard key={`${file.path}-${index}`} file={file} />)}
        </div>
      )}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          {attachments.map((item) => <LooklookThumb key={item.attachmentId} attachment={item} load={load} />)}
        </div>
      )}
      {trimmed.length > 0 && (
        <div style={{
          maxWidth: '80%',
          background: 'rgba(128,128,128,0.14)',
          padding: '8px 12px',
          borderRadius: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {trimmed}
        </div>
      )}
    </div>
  )
}