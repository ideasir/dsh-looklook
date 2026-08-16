/**
 * LooklookPluginCard: the looklook configuration card inside the Plugins
 * settings section's "插件配置" tab (`settings.plugin.item`). Uses the same
 * collapsible card chrome as the agent-loop / bash / web-search cards:
 * a header (title + description + chevron) that discloses:
 * - the feature switches (识别图像 / 识别视频);
 * - the model configuration (视觉模型 + 音频模型 + 本地 ASR 一键安装),
 *   visible while 识别图像 is ON.
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FeatureController, FeatureState } from './feature-controller.ts';
import { type ModelSettingsInjected } from './VisionSettings.tsx';
/** Injected face supplied by the plugin apply closure. */
export interface LooklookCardInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Feature controller (image / video toggles). */
    features: FeatureController;
    /** Reactive snapshot of the feature switches. */
    useFeatures: () => FeatureState;
    /** Probe one provider's `/models` endpoint through the host RPC. */
    listModels: ModelSettingsInjected['listModels'];
    /** Reactive snapshot of the image recognition master switch. */
    useImageRecognition: () => boolean;
}
/** The plugin-configuration card body. */
export declare function LooklookPluginCard(props: LooklookCardInjected): import("react").JSX.Element;
