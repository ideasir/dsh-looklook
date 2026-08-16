/**
 * dsh-looklook/upload — host-side upload support.
 *
 * POST /api/looklook-upload — save one uploaded file into the session's
 * workspace `.uploads/` directory (500 MB cap). Returns the absolute path so
 * the client can tell the model where the file landed.
 *
 * The channel accepts ANY extension — installing the plugin unlocks every
 * file type for upload (images still ride the native DSH pipeline; the
 * client filters which drops reach this route).
 *
 * A standard webServer route (registered like any other `/api` route), so
 * no DSH source is modified.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Upload cap: 500 MB for every file type. */
export declare const MAX_UPLOAD_BYTES: number;
/** Archive extensions (used for classification/hints, not a whitelist). */
export declare const ARCHIVE_EXTENSIONS: readonly [".zip", ".7z"];
/** Video extensions (used for classification/hints, not a whitelist). */
export declare const VIDEO_EXTENSIONS: readonly [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
/** Every extension the upload channel can accept (archives + video). */
export declare const ALL_EXTENSIONS: readonly string[];
/** Subdirectory (inside the session workspace) where uploads are stored. */
export declare const UPLOADS_DIR = ".uploads";
/** Whether the extension is an archive (classification only). */
export declare function isArchiveName(name: string): boolean;
/** Whether the extension is a video (classification only). */
export declare function isVideoName(name: string): boolean;
export interface UploadRequest {
    sessionId: string;
    name: string;
    /** Base64-encoded file bytes. */
    data: string;
}
/**
 * Register the upload route on the webServer service.
 * @param ctx - host context (injects webServer + sessions).
 */
export declare function registerUploadRoutes(ctx: Context): void;
