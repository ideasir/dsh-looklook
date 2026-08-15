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
    zip: boolean;
};
/** Plugin feature controller: one store + load + update. */
export interface FeatureController {
    store: SnapshotStore<FeatureState>;
    load(): void;
    setMultimodal(next: boolean): void;
    setZip(next: boolean): void;
}
/** Create the plugin feature controller. */
export declare function createFeatureController(api: IApiClient): FeatureController;
/** 7z support state. */
export type SevenZState = {
    status: 'unknown';
} | {
    status: 'checking';
} | {
    status: 'ready';
    installed: boolean;
} | {
    status: 'installing';
} | {
    status: 'error';
    message: string;
};
/** Query the 7z install state through the plugin's HTTP routes. */
export declare function fetchSevenZStatus(): Promise<{
    installed: boolean;
}>;
/** Trigger the 7z install through the plugin's HTTP route. */
export declare function requestSevenZInstall(): Promise<{
    ok: boolean;
    installed: boolean;
    output: string;
}>;
