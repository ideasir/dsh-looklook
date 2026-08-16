/**
 * Shared upload logic for dsh-looklook: upload any non-image file through the
 * plugin's `/api/looklook-upload` route (saved into the session workspace
 * `.uploads/`) and return its path. The caller stages the note into the
 * input draft — nothing is sent until the user presses Enter.
 *
 * The channel accepts EVERY extension (installing the plugin unlocks all
 * uploads); only browser-native image types are left to the DSH image
 * pipeline. This file mirrors the host route's no-whitelist policy.
 */
/** Whether a file name should be intercepted by the looklook upload channel
 * (i.e. it is NOT a native image). */
export declare function isUploadableName(name: string): boolean;
/**
 * Convert a File to a base64 data string asynchronously via FileReader, so a
 * large file never blocks the UI thread with a synchronous btoa loop.
 */
export declare function fileToBase64(file: File): Promise<string>;
/** Upload one file via XMLHttpRequest (reports upload progress). */
export declare function uploadFile(sessionId: string, file: File, onProgress?: (percent: number) => void): Promise<{
    path: string;
    name: string;
}>;
