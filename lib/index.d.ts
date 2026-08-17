/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. A single master switch (`looklook.enabled`) controls the whole
 * plugin:
 * - ON (default): every capability is enabled. Images / videos / archives /
 *   documents are routed through the plugin's own file channel (upload into
 *   the session `.uploads/`, the model sees only the path, then calls
 *   `looklook_see`), so the api-proxy's native "model does not support image
 *   input" check is never reached — no request rewriting, no admission
 *   override, no harness patch.
 * - OFF: the plugin is dormant — nothing is intercepted, the see tool answers
 *   "已关闭", and DSH behaves exactly as if the plugin were absent.
 *
 * Plugin-owned settings are read and written through the authorized
 * `remote.looklook` RPC namespace. They are deliberately NOT registered as
 * configurable LLM providers, because rc.6 renders every such entry in the
 * global model-provider picker. No `WEB_SETTINGS_NAMESPACES` patch.
 *
 * Upload / ASR install / model discovery / env check are Remote RPCs on the
 * `looklook` wire namespace (Typert), so they inherit the api-proxy
 * connection authorization instead of exposing unauth'd HTTP routes.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespaces, the routes, and every disposer.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type VisionSettings } from './settings.ts';
export { Config } from './settings.ts';
export { LooklookConfig } from './settings.ts';
export { AudioConfig } from './settings.ts';
export type { VisionProviderConfig, VisionSettings, VisionScope, LooklookSettings, LooklookScope, AudioProviderConfig, AudioSettings, AudioScope } from './settings.ts';
export type { DescribeImageInput, DescribeResult } from './vision-client.ts';
export { describeImages, statusMessage } from './vision-client.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "looklook";
/** Required services: settings, llm, sessions, credentials, tools, systemPrompt, fs. */
export declare const inject: string[];
/**
 * Plugin body: register the feature toggles + vision/audio settings
 * namespaces, expose their private settings RPCs, register the unified
 * looklook_see / process_zip tools, the upload RPC, and the ASR install RPC.
 */
export declare function apply(ctx: Context, config: VisionSettings): void;
