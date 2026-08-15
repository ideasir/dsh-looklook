/**
 * VisionSettings: the "视觉模型" settings section (`settings.section`).
 *
 * Rendered with the same design system as the Models settings page:
 * ui-primitives atoms (Button / Input / StateDot / icons) and --dsw-* tokens.
 * Providers list in failover order (primary first); edits are draft-local
 * until Save, which writes credentials (per-provider API key) and the
 * `vision` settings namespace in one commit.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Injected face supplied by the plugin apply closure. */
export interface VisionSettingsInjected {
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
    /** Reactive snapshot of the `multimodal` master switch (false hides this section). */
    useMultimodal: () => boolean;
}
/** One provider under local edit. */
export interface ProviderDraft {
    id: string;
    name: string;
    baseURL: string;
    model: string;
    enabled: boolean;
    /** Fresh API key being entered; undefined keeps the stored credential. */
    apiKey?: string;
}
/** Derive a credential reference for one provider id. */
export declare function credentialRefFor(id: string): string;
/** The settings section body, styled like the Models page. */
export declare function VisionSettingsSection(props: VisionSettingsInjected): import("react").JSX.Element;
