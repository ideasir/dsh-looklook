/**
 * LooklookFeatures: the master-switch controls inside the looklook plugin
 * card. Two slider-style switches:
 * - 支持更多扩展名 — ON adds .7z / video to the upload whitelist (.zip stays);
 * - 支持多模态 — ON enables image recognition and shows the vision config.
 * Plus the 7z install support row.
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
    /** Feature controller (multimodal / moreExtensions toggles). */
    features: FeatureController;
    /** Reactive snapshot of the feature switches. */
    useFeatures: () => FeatureState;
}
/** The master-switch + install-support body. */
export declare function LooklookFeaturesSection(props: FeaturesInjected): import("react").JSX.Element;
