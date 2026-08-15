/**
 * Host receiver for the client's model-discovery RPC (`remote.looklook`).
 * `listModels` probes an OpenAI-compatible `/models` endpoint with the
 * provider's stored credential, so the settings page can verify an API key
 * and offer the model list without a separate "test connection" step.
 */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** One model-discovery outcome, returned over the wire as lossless JSON. */
export type LooklookListModelsResult = {
    ok: true;
    models: string[];
} | {
    ok: false;
    error: string;
};
/**
 * Host service answering `remote.looklook.listModels`. Extends
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
}
