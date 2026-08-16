/**
 * dsh-looklook/upload — host-side upload support, exposed as a Remote RPC
 * (wire namespace `looklook`, method `upload`).
 *
 * The client uploads every intercepted file (image, archive, video) through
 * this RPC, which rides the authorized api-proxy connection — there is no
 * unauth'd HTTP route. The file lands in the session workspace `.uploads/`
 * and the returned absolute path is what the model receives.
 *
 * Safety:
 * - sessionId must resolve to a live session with a workspace;
 * - file name is basename-only (no path tricks);
 * - decoded bytes are capped (single-file limit, generous);
 * - the destination is verified to stay inside `.uploads/`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
/** Upload cap: 100 MB for every file type (RPC JSON carries base64, 4/3x). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** Archive extensions (used for classification/hints, not a whitelist). */
export const ARCHIVE_EXTENSIONS = ['.zip', '.7z'];
/** Video extensions (used for classification/hints, not a whitelist). */
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
/** Every extension the upload channel can accept (archives + video + images). */
export const ALL_EXTENSIONS = [...ARCHIVE_EXTENSIONS, ...VIDEO_EXTENSIONS];
/** Subdirectory (inside the session workspace) where uploads are stored. */
export const UPLOADS_DIR = '.uploads';
/** Basename-only, filesystem-safe file name (rejects path tricks and empties). */
export function safeFileName(name) {
    const base = basename(String(name ?? '')).trim();
    if (base === '' || base === '.' || base === '..')
        throw new Error('invalid file name');
    if (/[/\\\0]/.test(base))
        throw new Error('invalid file name');
    return base;
}
/** Whether the extension is an archive (classification only). */
export function isArchiveName(name) {
    return ARCHIVE_EXTENSIONS.includes(extnameOf(name));
}
/** Whether the extension is a video (classification only). */
export function isVideoName(name) {
    return VIDEO_EXTENSIONS.includes(extnameOf(name));
}
function extnameOf(name) {
    const dot = name.toLowerCase().lastIndexOf('.');
    return dot >= 0 ? name.toLowerCase().slice(dot) : '';
}
/**
 * Save one uploaded file into the session workspace `.uploads/` and return
 * its absolute path. Any file type is accepted (images ride this channel for
 * text-only models; multi-modal models keep the native pipeline because the
 * client asks the session modality first).
 */
export async function saveUpload(ctx, sessionId, name, dataBase64) {
    const safe = safeFileName(name);
    if (sessionId === '')
        throw new Error('missing sessionId');
    if (typeof dataBase64 !== 'string' || dataBase64 === '')
        throw new Error('missing file data');
    const bytes = Buffer.from(dataBase64, 'base64');
    if (bytes.length > MAX_UPLOAD_BYTES) {
        throw new Error(`file exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
    }
    // Resolve the session's workspace (cwd); a nonexistent session is refused.
    const sessions = ctx.get('sessions');
    if (sessions === undefined)
        throw new Error('sessions 服务不可用');
    const session = sessions.get(sessionId);
    const cwd = session?.header.cwd;
    if (cwd === undefined)
        throw new Error(`session not found or has no workspace: ${sessionId}`);
    const uploadDir = join(cwd, UPLOADS_DIR);
    await mkdir(uploadDir, { recursive: true });
    // resolve() + prefix guard: even a weird basename cannot escape.
    const target = resolve(uploadDir, safe);
    const resolvedUploadDir = resolve(uploadDir);
    if (target !== resolvedUploadDir && !target.startsWith(resolvedUploadDir + sep)) {
        throw new Error('invalid file target');
    }
    await writeFile(target, bytes);
    return { path: target, name: safe, size: bytes.length };
}
