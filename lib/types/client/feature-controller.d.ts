/**
 * Plugin master-switch controller: reads the `looklook` settings namespace
 * (`enabled`) through the wire settings API. One switch controls the whole
 * plugin — ON (default) = every capability enabled; OFF = plugin dormant and
 * DSH behaves as without it.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
/** Master-switch state. */
export type FeatureState = {
    status: 'loading';
} | {
    status: 'ready';
    enabled: boolean;
};
/** Plugin master-switch controller: one store + load + update. */
export interface FeatureController {
    store: SnapshotStore<FeatureState>;
    load(): void;
    setEnabled(next: boolean): void;
}
/** Create the plugin master-switch controller. */
export declare function createFeatureController(api: IApiClient): FeatureController;
