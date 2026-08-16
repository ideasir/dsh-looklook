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
/** Type guard: an image attachment reference. */
export function isImageRef(ref) {
    return 'attachmentId' in ref;
}
/** Type guard: a file reference. */
export function isFileRef(ref) {
    return 'path' in ref;
}
/** JSON serialization of one image reference (the tool's image_ref argument). */
export function imageRefJson(ref) {
    return JSON.stringify({
        attachmentId: ref.attachmentId,
        mediaType: ref.mediaType,
        bytes: ref.bytes,
        width: ref.width,
        height: ref.height,
    });
}
/** JSON serialization of one file reference. */
export function fileRefJson(file) {
    return JSON.stringify({ name: file.name, path: file.path, size: file.size });
}
/** Serialize any content reference to its wire JSON. */
export function contentRefJson(ref) {
    return isImageRef(ref) ? imageRefJson(ref) : fileRefJson(fileRefOf(ref));
}
/**
 * Parse a content-reference JSON string back to a ContentRef.
 * Accepts the image wire format (bare attachment reference) and the file
 * wire format ({ name, path, size }); returns undefined for anything else.
 */
export function parseContentRef(json) {
    try {
        const parsed = JSON.parse(json);
        if (typeof parsed?.attachmentId === 'string' && parsed.attachmentId.length > 0) {
            return imageRefOf(parsed);
        }
        if (typeof parsed?.path === 'string' && parsed.path.length > 0) {
            return {
                name: typeof parsed.name === 'string' ? parsed.name : basenameOf(parsed.path),
                path: parsed.path,
                size: typeof parsed.size === 'number' && Number.isFinite(parsed.size) ? parsed.size : 0,
            };
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
/** Coerce an unknown image-like object into a full ImageAttachmentRef. */
function imageRefOf(parsed) {
    return {
        attachmentId: parsed.attachmentId,
        mediaType: (typeof parsed.mediaType === 'string' ? parsed.mediaType : 'image/png'),
        bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
        width: typeof parsed.width === 'number' ? parsed.width : 0,
        height: typeof parsed.height === 'number' ? parsed.height : 0,
    };
}
/** Narrow a ContentRef to a FileContentRef for serialization. */
function fileRefOf(ref) {
    if (isFileRef(ref))
        return ref;
    throw new Error('image reference cannot serialize as a file reference');
}
/** Strip the directory portion of a path for a fallback display name. */
function basenameOf(path) {
    const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return index >= 0 ? path.slice(index + 1) : path;
}
