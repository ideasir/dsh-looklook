/**
 * Shared upload logic for dsh-looklook: upload one or more archive/video
 * files through the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`) and return their paths. The caller stages
 * the notes into the input draft — nothing is sent until the user presses
 * Enter.
 *
 * NOTE: this client-side extension list is a MIRROR of the authoritative
 * host whitelist in `src/upload.ts` (ARCHIVE_EXTENSIONS + VIDEO_EXTENSIONS).
 * Keep them in sync; the verify scripts assert equality.
 */
/** Accepted extensions (archives + video), mirroring `src/upload.ts`. */
export declare const ACCEPT_EXTENSIONS: string[];
/** Whether a file name is uploadable through the looklook channel. */
export declare function isUploadableName(name: string): boolean;
/**
 * Convert a File to a base64 data string asynchronously via FileReader, so a
 * large file never blocks the UI thread with a synchronous btoa loop.
 */
export declare function fileToBase64(file: File): Promise<string>;
/** Upload one file; returns the absolute path the host saved. */
export declare function uploadFile(sessionId: string, file: File): Promise<{
    path: string;
    name: string;
}>;
