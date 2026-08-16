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
import type { Context } from '@deepseek-ai/cordis';
/** Upload cap: 100 MB for every file type (RPC JSON carries base64, 4/3x). */
export declare const MAX_UPLOAD_BYTES: number;
/** Archive extensions (used for classification/hints, not a whitelist). */
export declare const ARCHIVE_EXTENSIONS: readonly [".zip", ".7z"];
/** Video extensions (used for classification/hints, not a whitelist). */
export declare const VIDEO_EXTENSIONS: readonly [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
/** Every extension the upload channel can accept (archives + video + images). */
export declare const ALL_EXTENSIONS: readonly string[];
/** Subdirectory (inside the session workspace) where uploads are stored. */
export declare const UPLOADS_DIR = ".uploads";
/** Basename-only, filesystem-safe file name (rejects path tricks and empties). */
export declare function safeFileName(name: string): string;
/** Whether the extension is an archive (classification only). */
export declare function isArchiveName(name: string): boolean;
/** Whether the extension is a video (classification only). */
export declare function isVideoName(name: string): boolean;
/**
 * Save one uploaded file into the session workspace `.uploads/` and return
 * its absolute path. Any file type is accepted (images ride this channel for
 * text-only models; multi-modal models keep the native pipeline because the
 * client asks the session modality first).
 */
export declare function saveUpload(ctx: Context, sessionId: string, name: string, dataBase64: string): Promise<{
    path: string;
    name: string;
    size: number;
}>;
