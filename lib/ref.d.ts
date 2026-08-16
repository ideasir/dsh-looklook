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
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/** One uploaded file, as staged by the client and stored under .uploads/. */
export interface FileContentRef {
    /** Original file name. */
    name: string;
    /** Absolute path inside the session workspace. */
    path: string;
    /** File size in bytes. */
    size: number;
}
/** Everything the plugin can point a tool at. */
export type ContentRef = ImageAttachmentRef | FileContentRef;
/** Type guard: an image attachment reference. */
export declare function isImageRef(ref: ContentRef): ref is ImageAttachmentRef;
/** Type guard: a file reference. */
export declare function isFileRef(ref: ContentRef): ref is FileContentRef;
/** JSON serialization of one image reference (the tool's image_ref argument). */
export declare function imageRefJson(ref: ImageAttachmentRef): string;
/** JSON serialization of one file reference. */
export declare function fileRefJson(file: FileContentRef): string;
/** Serialize any content reference to its wire JSON. */
export declare function contentRefJson(ref: ContentRef): string;
/**
 * Parse a content-reference JSON string back to a ContentRef.
 * Accepts the image wire format (bare attachment reference) and the file
 * wire format ({ name, path, size }); returns undefined for anything else.
 */
export declare function parseContentRef(json: string): ContentRef | undefined;
