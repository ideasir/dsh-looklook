/**
 * Host receiver for the client's RPCs (`remote.looklook`):
 * - `listModels` — probe an OpenAI-compatible `/models` endpoint with the
 *   provider's stored credential, so the settings page can verify an API key
 *   and offer the model list without a separate "test connection" step;
 * - `upload` — save one dropped file into the session `.uploads/` (the
 *   "file channel": images never touch the native attachment pipeline, so
 *   api-proxy's model-modality check is never triggered);
 * - `asrStatus` / `asrInstall` — local ASR one-click install state/trigger;
 * - `sessionModality` — report whether the session's current model accepts
 *   image input, so the client can route a dropped image to the native
 *   pipeline (multi-modal model) or to the file channel (text-only model).
 *
 * All methods are Remote (Typert) calls, so they ride the authorized
 * api-proxy connection — no unauth'd HTTP routes are exposed.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { MAX_UPLOAD_BYTES } from './upload.ts';
import { readReadyMarker, type AsrInstallPhase } from './asr-install.ts';
import { type EnvCheckReport, type EnvCheckItem } from './env-check.ts';
/** One model-discovery outcome, returned over the wire as lossless JSON. */
export type LooklookListModelsResult = {
    ok: true;
    models: string[];
} | {
    ok: false;
    error: string;
};
/** One vision-model capability probe outcome. */
export type LooklookTestVisionResult = {
    ok: true;
    supportsImage: boolean;
    message: string;
} | {
    ok: false;
    error: string;
};
/** One audio-model capability probe outcome (L1 = transcript-only,
 * L2 = transcript + tone/music/pace via input_audio). */
export type LooklookTestAudioResult = {
    ok: true;
    level: 'L1' | 'L2' | 'none';
    message: string;
} | {
    ok: false;
    error: string;
};
/** One upload outcome. */
export type LooklookUploadResult = {
    ok: true;
    path: string;
    name: string;
    size: number;
} | {
    ok: false;
    error: string;
};
/** Local ASR install status. */
export interface LooklookAsrStatus {
    installed: boolean;
    phase: AsrInstallPhase;
    model: string;
    error: string | null;
}
/** Session modality probe outcome. */
export type LooklookModalityResult = {
    ok: true;
    supportsImage: boolean;
} | {
    ok: false;
    error: string;
};
/**
 * Host service answering `remote.looklook.*`. Extends
 * `TypertRemoteService` so the gateway's source-mode discovery sees the
 * binding (`ctx.looklookRemote` ← wire namespace `looklook`); the client
 * mounts the matching descriptor.
 */
export declare class LooklookRemoteService extends TypertRemoteService {
    constructor(ctx: Context);
    /**
     * Probe one provider's `/models` endpoint. Uses the just-typed key when the
     * caller passes one (the settings editor has not saved yet); otherwise reads
     * the stored credential for the reference.
     * @param provider - the provider's endpoint, credential reference, and an
     *   optional just-typed key that takes precedence over storage.
     * @returns the model id list, or a classified failure.
     */
    listModels(provider: {
        baseURL: string;
        apiKeyEnv: string;
        apiKey?: string;
    }): Promise<LooklookListModelsResult>;
    /**
     * Save one dropped file into the session workspace `.uploads/`. Images,
     * archives, and videos all ride this channel; the returned path is what the
     * model sees. Authorized by the connection, size-capped, path-safe.
     */
    upload(payload: {
        sessionId: string;
        name: string;
        /** Base64-encoded file bytes. */
        data: string;
    }): Promise<LooklookUploadResult>;
    /** Report the local ASR install state (ready marker + in-memory phase). */
    asrStatus(): Promise<LooklookAsrStatus>;
    /**
     * Trigger the local ASR install (idempotent). Returns the current phase
     * after starting or acknowledging; the client polls asrStatus for progress.
     */
    asrInstall(): Promise<{
        ok: true;
        phase: AsrInstallPhase;
        already: boolean;
    } | {
        ok: false;
        error: string;
    }>;
    /**
     * Report whether the session's current model accepts image input, by
     * resolving the session's last request header route. Used by the client to
     * decide between the native image pipeline and the file channel.
     */
    sessionModality(sessionId: string): Promise<LooklookModalityResult>;
    /**
     * Read one uploaded file's bytes back from the session `.uploads/` (the
     * client renders thumbnails / lightbox for image files through this RPC).
     * Restricted: basename only, must exist under `.uploads/`, image types
     * only, size-capped — a read-only file channel, no arbitrary paths.
     */
    readUpload(payload: {
        sessionId: string;
        name: string;
    }): Promise<{
        ok: true;
        mediaType: string;
        data: string;
    } | {
        ok: false;
        error: string;
    }>;
    /** Run the full environment self-check for the settings dialog. */
    envCheck(): Promise<EnvCheckReport>;
    /** One-click repair for one env item; returns the item's fresh state. */
    envRepair(action: 'install-yt-dlp' | 'install-asr'): Promise<EnvCheckItem>;
    /**
     * Probe whether one vision provider actually accepts image input, by
     * sending a tiny built-in test image through chat/completions. A 2xx with
     * a non-empty answer means the model can see images; 400/415/422 mean the
     * endpoint rejects image input.
     */
    testVision(provider: {
        baseURL: string;
        apiKeyEnv: string;
        apiKey?: string;
        model: string;
    }): Promise<LooklookTestVisionResult>;
    /**
     * Probe one audio provider's capability level:
     * - L2: chat/completions + input_audio works (transcript + tone/music/pace);
     * - L1: only /v1/audio/transcriptions works (transcript only);
     * - none: neither route accepts the test audio.
     */
    testAudio(provider: {
        baseURL: string;
        apiKeyEnv: string;
        apiKey?: string;
        model: string;
    }): Promise<LooklookTestAudioResult>;
}
export { MAX_UPLOAD_BYTES, readReadyMarker };
