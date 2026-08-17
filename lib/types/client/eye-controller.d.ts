/**
 * Per-session eye-toggle controller. Reads and writes the `vision` settings
 * namespace (`sessionOverrides[sessionId]`, default `on`) through the wire
 * settings API, and reports whether any enabled provider is configured so the
 * toggle can warn when the eye is on but recognition is not configured.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { PluginSettingsClient } from './plugin-settings.ts';
/** Eye toggle state for one session. */
export type EyeState = {
    status: 'loading';
} | {
    status: 'ready';
    eye: 'on' | 'off';
    unconfigured: boolean;
};
/** Per-session eye controller: one store, load, and toggle. */
export interface EyeController {
    store: SnapshotStore<EyeState>;
    load(): void;
    toggle(next: 'on' | 'off'): void;
}
/** Create the controller for one session. */
export declare function createEyeController(api: PluginSettingsClient, sessionId: string): EyeController;
