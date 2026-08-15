/**
 * Plugin feature controller: reads the `looklook` settings namespace
 * (multimodal / zip master switches) through the wire settings API and
 * reports the 7z install state via the plugin's HTTP routes.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
/** Feature-switch state. */
export type FeatureState = {
    status: 'loading';
} | {
    status: 'ready';
    multimodal: boolean;
    moreExtensions: boolean;
};
/** Plugin feature controller: one store + load + update. */
export interface FeatureController {
    store: SnapshotStore<FeatureState>;
    load(): void;
    setMultimodal(next: boolean): void;
    setMoreExtensions(next: boolean): void;
}
/** Create the plugin feature controller. */
export declare function createFeatureController(api: IApiClient): FeatureController;
