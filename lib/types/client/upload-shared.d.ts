/**
 * Shared upload logic for dsh-looklook: upload any dropped file (image,
 * archive, video) through the plugin's `remote.looklook.upload` RPC (saved
 * into the session workspace `.uploads/`) and return its path. The caller
 * stages the note into the input draft — nothing is sent until the user
 * presses Enter.
 *
 * The channel accepts EVERY extension; the client asks the host about the
 * session model's modality first and routes images to the native pipeline
 * when the model can already see them (multi-modal models stay native).
 */
/** Image extensions that ride the native DSH pipeline when the model is
 * multi-modal (they are intercepted only for text-only sessions). */
export declare const NATIVE_IMAGE_EXTENSIONS: string[];
/** Whether a file name is an image that can ride the native pipeline. */
export declare function isNativeImageName(name: string): boolean;
/** Whether a file name should be intercepted by the looklook upload channel
 * (i.e. it is NOT a native image; images are routed by modality at drop time). */
export declare function isUploadableName(name: string): boolean;
/**
 * Convert a File to a base64 data string asynchronously via FileReader, so a
 * large file never blocks the UI thread with a synchronous btoa loop.
 */
export declare function fileToBase64(file: File): Promise<string>;
/** The remote surface the upload RPC lives on. */
export interface LooklookUploadRemote {
    upload?(payload: {
        sessionId: string;
        name: string;
        data: string;
    }): Promise<{
        ok: boolean;
        value?: {
            ok: boolean;
            path?: string;
            error?: string;
        };
        error?: {
            message?: string;
        };
    }>;
}
/** Upload one file via the authorized RPC. */
export declare function uploadFile(remote: LooklookUploadRemote | undefined, sessionId: string, file: File, onProgress?: (percent: number) => void): Promise<{
    path: string;
    name: string;
}>;
/** Session modality probe result. */
export type SessionModality = {
    ok: true;
    supportsImage: boolean;
} | {
    ok: false;
    error: string;
};
/** One environment-check item (mirrors the host EnvCheckItem). */
export interface EnvCheckItem {
    id: string;
    label: string;
    status: 'ok' | 'missing' | 'error';
    detail: string;
    repairable: boolean;
    repairAction?: 'install-yt-dlp' | 'install-asr';
    guidance?: string;
}
/** The full environment report (mirrors the host EnvCheckReport). */
export interface EnvCheckReport {
    ok: boolean;
    items: EnvCheckItem[];
    summary: string;
}
