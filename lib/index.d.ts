/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. Feature switches (settings page):
 * - 多模态 (multimodal): image vision assist for text-only models. When ON,
 *   answers `prompt/image-admission` and rewrites model requests; when OFF
 *   the plugin is invisible to images (native DSH behavior).
 * - ZIP: the `process_zip` tool (vendored from @ideasir/dsh-zip) plus the
 *   archive upload channel.
 *
 * Upload channel: the client uploads archives/video through the registered
 * `/api/looklook-upload` route into the session workspace `.uploads/` and
 * sends a user message with the file path; the model then processes the file
 * with process_zip / fs / bash.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespaces, the event listeners, the routes, and every disposer.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type VisionSettings } from './settings.ts';
export { Config } from './settings.ts';
export { LooklookConfig } from './settings.ts';
export type { VisionProviderConfig, VisionSettings, VisionScope, LooklookSettings, LooklookScope } from './settings.ts';
export { PLACEHOLDER_TEXT } from './translate.ts';
export type { DescribeImageInput, DescribeResult } from './vision-client.ts';
export { describeImages, statusMessage } from './vision-client.ts';
export type { ImageAdmissionDecision, ImageAdmissionPayload, VisionErrorCode } from './types.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "looklook";
/** Required services: settings, llm, sessions, attachments, credentials, tools, systemPrompt, webServer. */
export declare const inject: string[];
/**
 * Plugin body: register the feature toggles + vision settings namespaces,
 * answer the image admission decision point, rewrite model requests at the
 * `agent/request-messages` waterfall (when multimodal is ON), register the
 * process_zip tool (gated by the zip toggle) and the upload/7z routes.
 */
export declare function apply(ctx: Context, config: VisionSettings): void;
