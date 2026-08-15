/**
 * LooklookUserMessageNodeView — replaces the default user-message bubble so
 * the chat renders the ORIGINAL image the user sent, even though the session
 * record only carries the plugin's rewritten text (rc.6 rewrites the record).
 *
 * The host embeds a full image-reference JSON in the marker 「【附图:{...}】」
 * and wraps its model-facing tool-reference text in
 * 「【looklook:开始】…【looklook:结束】」 (hidden from the user). This view
 * renders the image with the harness's native ImageGallery (click to enlarge
 * in the lightbox) and shows only the user's own question text. Native image
 * blocks (multimodal models / newer harnesses) render the same way. The
 * component is defensive: unexpected shapes fall back to plain text.
 */

import { ImageGallery } from '@deepseek-ai/dsh-client-ui-attachment'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { MessageImageLabels } from '@deepseek-ai/dsh-client-ui-attachment'

/** The host's attachment marker: 「【附图:<ref-json-or-id>】」. */
const IMAGE_MARKER_RE = /【附图:([^】]+)】/g

/** Host hide delimiters: strip everything between them before display. */
const HIDE_START = '【looklook:开始】'
const HIDE_END = '【looklook:结束】'

/** Chinese labels for the native image gallery + lightbox. */
const IMAGE_LABELS: MessageImageLabels = {
  image: '图片',
  open: '查看原图',
  openNamed: (label) => '查看原图：' + label,
  loading: '加载中…',
  loadFailed: '加载失败，点击重试',
  lightbox: { dialog: '图片预览', close: '关闭预览' },
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
 * Defensive user-message renderer: renders the image (marker/native) with the
 * native gallery + lightbox, shows only the user's own text; falls back to
 * plain text on unexpected shapes.
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
  for (const raw of content) {
    const block = raw as ContentBlockLike
    if (block?.type === 'text' && typeof block.text === 'string') {
      texts.push(stripHidden(block.text))
    } else if (block?.type === 'image' && typeof block.attachment?.attachmentId === 'string') {
      attachments.push(block.attachment as ImageAttachmentRef)
    }
  }
  const joined = texts.join('')
  const cleaned = joined.replace(IMAGE_MARKER_RE, (_all, payload: string) => {
    attachments.push(parseMarkerRef(payload))
    return ''
  })
  const trimmed = cleaned.trim()
  if (attachments.length === 0 && trimmed.length === 0) return null
  const load = props.loadImage ?? (() => Promise.reject(new Error('image loader unavailable')))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, margin: '8px 0' }}>
      {attachments.length > 0 && (
        <ImageGallery
          images={attachments.map(attachment => ({ attachment }))}
          load={load}
          align="end"
          labels={IMAGE_LABELS}
        />
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