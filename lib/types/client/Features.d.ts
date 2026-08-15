/**
 * LooklookFeatures: the plugin master-switch settings section
 * (`settings.section`). Renders:
 * - 开启多模态 — master switch for the vision feature; when OFF the plugin is
 *   invisible to images (native DSH behavior) and the vision-model section is
 *   hidden.
 * - 开启 ZIP — master switch for the process_zip tool and archive uploads.
 * - 安装支持 — 7z CLI install button (host apt install, user-triggered).
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
    /** Feature controller (multimodal / zip toggles). */
    features: FeatureController;
    /** Reactive snapshot of the feature switches. */
    useFeatures: () => FeatureState;
}
/** The plugin settings section body. */
export declare function LooklookFeaturesSection(props: FeaturesInjected): import("react").JSX.Element;
