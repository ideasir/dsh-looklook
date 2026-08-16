/**
 * Plugin feature controller: reads the `looklook` settings namespace
 * (imageRecognition / videoRecognition master switches) through the wire
 * settings API.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client';
/** Feature-switch state. */
export type FeatureState = {
    status: 'loading';
} | {
    status: 'ready';
    imageRecognition: boolean;
    videoRecognition: boolean;
};
/** Plugin feature controller: one store + load + update. */
export interface FeatureController {
    store: SnapshotStore<FeatureState>;
    load(): void;
    setImageRecognition(next: boolean): void;
    setVideoRecognition(next: boolean): void;
}
/** Create the plugin feature controller. */
export declare function createFeatureController(api: IApiClient): FeatureController;
