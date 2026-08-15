/**
 * LooklookPluginTab: the looklook entry inside the Plugins settings section
 * (`settings.plugins.tab`). One tab = one plugin setting:
 * - the master switches (多模态 / ZIP) and the 7z install support;
 * - the vision-model configuration, visible while 多模态 is ON.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FeatureController } from './feature-controller.ts';
import { type VisionSettingsInjected } from './VisionSettings.tsx';
/** Injected face supplied by the plugin apply closure. */
export interface LooklookTabInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Feature controller (multimodal / zip toggles). */
    features: FeatureController;
    /** Probe one provider's `/models` endpoint through the host RPC. */
    listModels: VisionSettingsInjected['listModels'];
    /** Reactive snapshot of the `multimodal` master switch. */
    useMultimodal: () => boolean;
}
/** The Plugins-settings tab body. */
export declare function LooklookPluginTab(props: LooklookTabInjected): import("react").JSX.Element;
