/**
 * dsh-looklook — vision-assist for text-only conversation models.
 *
 * Host plugin. Answers the gateway's `prompt/image-admission` decision point
 * (admits images regardless of the selected model's declared modalities) and
 * rewrites model requests at the `agent/request-messages` waterfall:
 *
 * - eye off (per-session `vision.sessionOverrides`): images become the
 *   「没有开启多模态功能」placeholder, so a text-only model never sees raw
 *   image bytes and never errors;
 * - eye on + model declares image input: pass-through — the model's own
 *   multimodal capability is used;
 * - eye on + model is text-only: every image is described by the configured
 *   vision provider (primary, then fallbacks) and replaced with the text.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespace, the event listeners, and every disposer.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type VisionSettings } from './settings.ts';
export { Config } from './settings.ts';
export type { VisionProviderConfig, VisionSettings, VisionScope } from './settings.ts';
export { describeResultText, PLACEHOLDER_TEXT } from './translate.ts';
export type { DescribeImageInput, DescribeResult } from './vision-client.ts';
export { describeImages, statusMessage } from './vision-client.ts';
export type { ImageAdmissionDecision, ImageAdmissionPayload, VisionDescribeEvent, VisionErrorCode } from './types.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "looklook";
/** Required services: settings (config + eye state), llm (model capability), sessions (cache log), attachments (image bytes), credentials (API keys). */
export declare const inject: string[];
/**
 * Plugin body: register the `vision` settings namespace, answer the image
 * admission decision point, and rewrite model requests at the
 * `agent/request-messages` waterfall.
 * @param ctx - host context.
 * @param config - composition-base configuration (the user settings layer
 *   overrides it live).
 */
export declare function apply(ctx: Context, config: VisionSettings): void;
