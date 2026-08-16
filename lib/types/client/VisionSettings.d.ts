/**
 * ModelSettings — the looklook "模型配置" section inside the plugin card:
 * - 视觉模型: recognizes images AND video frames (video = frames → image).
 *   Primary + fallbacks with automatic failover.
 * - 音频模型: transcript + sound understanding in one config; the plugin
 *   probes the model's capability at use time (no user label needed).
 *   Plus a one-click local ASR install (faster-whisper medium).
 *
 * Both lists reuse {@link ProviderListEditor}; the local ASR install is a
 * small status/trigger card wired to the host routes.
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
    }) => Promise<{
        ok: true;
        models: string[];
    } | {
        ok: false;
        error: string;
    }>;
}
/** The model-configuration body (visual + audio sections). */
export declare function ModelSettingsSection(props: ModelSettingsInjected): import("react").JSX.Element;
