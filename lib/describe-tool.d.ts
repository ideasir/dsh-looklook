/**
 * Image recognition logic for looklook ("look at anything").
 *
 * The MAIN MODEL decides what to ask the vision model: it passes an image
 * reference plus whatever question it judges appropriate. The unified
 * looklook_see tool dispatches here for image sources.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { VisionScope, LooklookScope } from './settings.ts';
/**
 * Resolve the image_ref argument: prefer the exact reference recorded when
 * the image arrived (registry), then the model-supplied JSON fields.
 */
export declare function resolveRef(raw: string, registry: ReadonlyMap<string, ImageAttachmentRef>): {
    ref: ImageAttachmentRef;
} | {
    error: string;
};
/** Whether the image-recognition feature is enabled. */
export declare function imageRecognitionEnabled(features: LooklookScope): boolean;
/**
 * Describe one image by reference using the vision model.
 * @returns the description text (or a failure message).
 */
export declare function describeImageByRef(ctx: Context, scope: VisionScope, refRegistry: Map<string, ImageAttachmentRef>, rawRef: string, question: string, signal: AbortSignal): Promise<string>;
