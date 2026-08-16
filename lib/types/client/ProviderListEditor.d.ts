/**
 * ProviderListEditor — a reusable provider-list editor (primary + fallbacks,
 * failover order) for one settings namespace. Used by the looklook card for
 * both the vision model list and the audio model list.
 *
 * Edits are draft-local until Save, which writes credentials (per-provider
 * API key) and the namespace's `providers` in one commit. Model discovery
 * (fetch /models) is optional and provided by the caller.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
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
/** Injected face for one provider-list editor. */
export interface ProviderListEditorProps {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Settings namespace to read/write (e.g. 'vision', 'looklook-audio'). */
    ns: string;
    /** Section title (e.g. "视觉模型" / "音频模型"). */
    title: string;
    /** Intro copy under the title. */
    intro: string;
    /** Optional /models probe; absent = the fetch button is hidden. */
    listModels?: (provider: {
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
}
/**
 * The full provider-list editor. Every state hook lives here; the caller
 * mounts it once per namespace (visual / audio).
 */
export declare function ProviderListEditor(props: ProviderListEditorProps): import("react").JSX.Element;
