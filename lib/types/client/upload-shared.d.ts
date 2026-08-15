/**
 * Shared upload logic for dsh-looklook: upload one or more archive/video
 * files through the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`), then send a normal user message carrying
 * every file path so the model can process them.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
/** Whether a file name is uploadable through the looklook channel. */
export declare function isUploadableName(name: string): boolean;
/** Convert a File's bytes to a base64 string (chunked to avoid stack blowups). */
export declare function fileToBase64(file: File): Promise<string>;
/** Upload one file; returns the absolute path the host saved. */
export declare function uploadFile(sessionId: string, file: File): Promise<{
    path: string;
    name: string;
}>;
/**
 * Upload every file and send one user message listing the paths.
 * @returns the number of successfully uploaded files.
 */
export declare function uploadAndSend(api: IApiClient, sessionId: string, files: File[], buildNote: (name: string, path: string) => string): Promise<{
    ok: number;
    failed: number;
}>;
