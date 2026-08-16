/**
 * LooklookFeatures: the master-switch controls inside the looklook plugin
 * card. Two slider-style switches:
 * - 识别图像 — ON enables plugin image recognition (file channel);
 * - 识别视频 — ON enables video analysis (frames + audio).
 */
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FeatureController, FeatureState } from './feature-controller.ts';
/** Injected face supplied by the plugin apply closure. */
export interface FeaturesInjected {
    /** The wire API client. */
    api: IApiClient;
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Feature controller (image / video recognition toggles). */
    features: FeatureController;
    /** Reactive snapshot of the feature switches. */
    useFeatures: () => FeatureState;
}
/** The master-switch body. */
export declare function LooklookFeaturesSection(props: FeaturesInjected): import("react").JSX.Element;
