/**
 * dsh-looklook/upload — host-side upload support.
 *
 * - POST /api/looklook-upload — save one uploaded file into the session's
 *   workspace `.uploads/` directory (500 MB cap, extension whitelist:
 *   archives + video). Returns the absolute path so the client can tell the
 *   model where the file landed.
 * - GET  /api/looklook-7z-status — whether the 7z CLI is installed.
 * - POST /api/looklook-7z-install — install p7zip-full via apt (user-triggered
 *   from the plugin settings page).
 *
 * These are standard webServer routes (registered like any other `/api`
 * route), so no DSH source is modified.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Upload cap: 500 MB for every file type. */
export declare const MAX_UPLOAD_BYTES: number;
/** Archive extensions accepted by the upload channel. */
export declare const ARCHIVE_EXTENSIONS: readonly [".zip", ".7z"];
/** Video extensions accepted by the upload channel. */
export declare const VIDEO_EXTENSIONS: readonly [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v"];
/** Subdirectory (inside the session workspace) where uploads are stored. */
export declare const UPLOADS_DIR = ".uploads";
/** Whether the extension is on the archive whitelist. */
export declare function isArchiveName(name: string): boolean;
/** Whether the extension is on the video whitelist. */
export declare function isVideoName(name: string): boolean;
/** Whether the name is allowed by the upload channel at all. */
export declare function isAllowedUploadName(name: string): boolean;
/** Whether the 7z CLI is available on PATH. */
export declare function is7zInstalled(): Promise<boolean>;
/** Install p7zip-full via apt (best effort). */
export declare function install7z(): Promise<{
    ok: boolean;
    output: string;
}>;
export interface UploadRequest {
    sessionId: string;
    name: string;
    /** Base64-encoded file bytes. */
    data: string;
}
/**
 * Register the upload + 7z routes on the webServer service.
 * @param ctx - host context (injects webServer + sessions).
 */
export declare function registerUploadRoutes(ctx: Context): void;
