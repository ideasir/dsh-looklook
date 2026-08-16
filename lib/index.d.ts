/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. Feature switches (settings page):
 * - 识别图像 (imageRecognition): the plugin answers image questions for
 *   text-only conversation models. Images NEVER enter the native attachment
 *   pipeline: the client routes every dropped image through the plugin's own
 *   upload channel into the session workspace `.uploads/`, and the message
 *   the model receives carries only the file path. The api-proxy's native
 *   "model does not support image input" check is therefore never reached —
 *   no request rewriting, no admission override, no harness patch.
 * - 识别视频 (videoRecognition): video analysis (frames + audio understanding);
 *   OFF = files saved only, never analyzed.
 *
 * Settings exposure is the standard rc.6 mechanism: the `vision`,
 * `looklook`, and `looklook-audio` namespaces are declared through
 * `llm.registerConfigurableProviders()`, and dsh-host-apiproxy's
 * configuration-client boundary automatically serves every configurable
 * provider's settings namespace. No `WEB_SETTINGS_NAMESPACES` patch.
 *
 * Upload / ASR install / model discovery are Remote RPCs on the `looklook`
 * wire namespace (Typert), so they inherit the api-proxy connection
 * authorization instead of exposing unauth'd HTTP routes.
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
 * namespaces, declare them as configurable providers (the rc.6 standard way
 * to expose a namespace to the configuration client), register the unified
 * looklook_see / process_zip tools, the upload RPC, and the ASR install RPC.
 */
export declare function apply(ctx: Context, config: VisionSettings): void;
