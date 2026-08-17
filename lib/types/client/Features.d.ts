/**
 * LooklookFeatures: the plugin card's body:
 * - a master switch (开启看看 / 关闭：DSH 恢复原样);
 * - a "支持格式" grid listing every content type the plugin understands,
 *   each with an icon;
 * - a compact "支持视频平台" line (抖音 / B站 / YouTube / 西瓜 / 更多 yt-dlp
 *   支持的平台).
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
    /** Feature controller (master switch). */
    features: FeatureController;
    /** Reactive snapshot of the master switch. */
    useFeatures: () => FeatureState;
}
/** The plugin-card body. */
export declare function LooklookFeaturesSection(props: FeaturesInjected): import("react").JSX.Element;
