/**
 * Image recognition logic for looklook ("look at anything").
 *
 * The MAIN MODEL decides what to ask the vision model: it passes an image
 * reference plus whatever question it judges appropriate. The unified
 * looklook_see tool dispatches here for image sources.
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { enabledProviders, looklookFeatures } from "./settings.js";
import { describeImages } from "./vision-client.js";
import { isImageRef, parseContentRef } from "./ref.js";
/**
 * Resolve the image_ref argument: prefer the exact reference recorded when
 * the image arrived (registry), then the model-supplied JSON fields.
 */
export function resolveRef(raw, registry) {
    const trimmed = raw.trim();
    if (trimmed.length === 0)
        return { error: 'image_ref 为空' };
    // 1) Try JSON reference (what the user message carries).
    const parsed = parseContentRef(trimmed);
    if (parsed !== undefined && isImageRef(parsed)) {
        const exact = registry.get(parsed.attachmentId);
        if (exact !== undefined)
            return { ref: exact };
        return { ref: parsed };
    }
    // 2) Bare attachmentId lookup.
    const byId = registry.get(trimmed);
    if (byId !== undefined)
        return { ref: byId };
    return { error: '无法解析图片引用（image_ref 无效，或该图片已不在本会话的可用范围）' };
}
/** Whether the image-recognition feature is enabled. */
export function imageRecognitionEnabled(features) {
    return looklookFeatures(features).imageRecognition;
}
/**
 * Describe one image by reference using the vision model.
 * @returns the description text (or a failure message).
 */
export async function describeImageByRef(ctx, scope, refRegistry, rawRef, question, signal) {
    const resolved = resolveRef(rawRef, refRegistry);
    if ('error' in resolved)
        return '识图失败：' + resolved.error;
    try {
        const stored = await ctx.attachments.readImage(resolved.ref, signal);
        const providers = enabledProviders(scope);
        const maxChars = scope.get().maxDescribeChars;
        const credentials = ctx.get('credentials');
        const resolveApiKey = async (ref) => {
            if (credentials === undefined)
                return undefined;
            const resolvedCred = await credentials.resolve(credentialRef(ref));
            return resolvedCred?.value;
        };
        const result = await describeImages(providers, resolveApiKey, [{ mediaType: stored.ref.mediaType, data: stored.data }], maxChars, signal, question);
        if (!result.ok)
            return '识图失败：' + result.message;
        return result.text;
    }
    catch (error) {
        return '识图失败：' + (error instanceof Error ? error.message : String(error));
    }
}
