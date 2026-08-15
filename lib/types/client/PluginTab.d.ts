/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
 * collapsible card chrome as the agent-loop / bash / web-search cards:
 * a header (title + description + chevron) that discloses the controls:
 * - the master switches (多模态 / ZIP) and the 7z install support;
 * - the vision-model configuration, visible while 多模态 is ON.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FeatureController, FeatureState } from './feature-controller.ts';
import { type VisionSettingsInjected } from './VisionSettings.tsx';
/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Feature controller (multimodal / zip toggles). */
    features: FeatureController;
    /** Reactive snapshot of the feature switches. */
    useFeatures: () => FeatureState;
    /** Probe one provider's `/models` endpoint through the host RPC. */
    listModels: VisionSettingsInjected['listModels'];
    /** Reactive snapshot of the `multimodal` master switch. */
    useMultimodal: () => boolean;
}
/** The plugin-configuration card body. */
export declare function LooklookPluginCard(props: LooklookCardInjected): import("react").JSX.Element;
