/**
 * Unified content references for dsh-looklook ("look at anything").
 *
 * The plugin turns whatever the user sends — images today, archives, and
 * later PDFs / documents / spreadsheets — into a reference the main model
 * can pass to a tool and the client can render. This module is the single
 * home for that abstraction: one discriminated union, one JSON serializer,
 * one parser. Protocol compatibility: the image wire format is unchanged
 * (a bare image-reference JSON), so existing session records and tests keep
 * working; file references use their own JSON shape.
 */

import type { ImageAttachmentRef, ImageMediaType } from '@deepseek-ai/dsh-attachment'

/** One uploaded file, as staged by the client and stored under .uploads/. */
export interface FileContentRef {
  /** Original file name. */
  name: string
  /** Absolute path inside the session workspace. */
  path: string
  /** File size in bytes. */
  size: number
}

/** Everything the plugin can point a tool at. */
export type ContentRef = ImageAttachmentRef | FileContentRef

/** Type guard: an image attachment reference. */
export function isImageRef(ref: ContentRef): ref is ImageAttachmentRef {
  return 'attachmentId' in ref
}

/** Type guard: a file reference. */
export function isFileRef(ref: ContentRef): ref is FileContentRef {
  return 'path' in ref
}

/** JSON serialization of one image reference (the tool's image_ref argument). */
export function imageRefJson(ref: ImageAttachmentRef): string {
  return JSON.stringify({
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    bytes: ref.bytes,
    width: ref.width,
    height: ref.height,
  })
}

/** JSON serialization of one file reference. */
export function fileRefJson(file: FileContentRef): string {
  return JSON.stringify({ name: file.name, path: file.path, size: file.size })
}

/** Serialize any content reference to its wire JSON. */
export function contentRefJson(ref: ContentRef): string {
  return isImageRef(ref) ? imageRefJson(ref) : fileRefJson(fileRefOf(ref))
}

/**
 * Parse a content-reference JSON string back to a ContentRef.
 * Accepts the image wire format (bare attachment reference) and the file
 * wire format ({ name, path, size }); returns undefined for anything else.
 */
export function parseContentRef(json: string): ContentRef | undefined {
  try {
    const parsed = JSON.parse(json) as Partial<ImageAttachmentRef & FileContentRef>
    if (typeof parsed?.attachmentId === 'string' && parsed.attachmentId.length > 0) {
      return imageRefOf(parsed)
    }
    if (typeof parsed?.path === 'string' && parsed.path.length > 0) {
      return {
        name: typeof parsed.name === 'string' ? parsed.name : basenameOf(parsed.path),
        path: parsed.path,
        size: typeof parsed.size === 'number' && Number.isFinite(parsed.size) ? parsed.size : 0,
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Coerce an unknown image-like object into a full ImageAttachmentRef. */
function imageRefOf(parsed: Partial<ImageAttachmentRef>): ImageAttachmentRef {
  return {
    attachmentId: parsed.attachmentId as ImageAttachmentRef['attachmentId'],
    mediaType: (typeof parsed.mediaType === 'string' ? parsed.mediaType : 'image/png') as ImageMediaType,
    bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
    width: typeof parsed.width === 'number' ? parsed.width : 0,
    height: typeof parsed.height === 'number' ? parsed.height : 0,
  }
}

/** Narrow a ContentRef to a FileContentRef for serialization. */
function fileRefOf(ref: ContentRef): FileContentRef {
  if (isFileRef(ref)) return ref
  throw new Error('image reference cannot serialize as a file reference')
}

/** Strip the directory portion of a path for a fallback display name. */
function basenameOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(index + 1) : path
}
