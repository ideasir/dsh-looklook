/**
 * ModelSettings — the looklook "模型配置" section inside the plugin card:
 * - 视觉模型: recognizes images AND video frames (video = frames → image).
 *   Primary + fallbacks with automatic failover.
 * - 音频模型: transcript + sound understanding in one config; the plugin
 *   probes the model's capability at use time (no user label needed).
 *   Plus a one-click local ASR install (faster-whisper medium).
 *
 * Both lists reuse {@link ProviderListEditor}; the local ASR install card is
 * wired to the authorized remote.looklook RPCs (asrStatus / asrInstall).
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Injected face supplied by the plugin apply closure. */
export interface ModelSettingsInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Probe one provider's `/models` endpoint through the host RPC. */
    listModels: (provider: {
        baseURL: string;
        apiKeyEnv: string;
        apiKey?: string;
    }) => Promise<{
        ok: true;
        models: string[];
    } | {
        ok: false;
        error: string;
    }>;
    /** Read the local ASR install state through the authorized RPC. */
    asrStatus: () => Promise<AsrStatus>;
    /** Trigger the local ASR install through the authorized RPC. */
    asrInstall: () => Promise<{
        ok: true;
        phase: string;
        already: boolean;
    } | {
        ok: false;
        error: string;
    }>;
}
/** Local ASR install status (from the host RPC). */
export interface AsrStatus {
    installed: boolean;
    phase: string;
    error?: string | null;
}
/** The model-configuration body (visual + audio sections). */
export declare function ModelSettingsSection(props: ModelSettingsInjected): import("react").JSX.Element;
