/**
 * Image handling for text-only conversation models.
 *
 * Pseudo-native multimodal: the plugin does NOT translate images up front.
 * It replaces each image with a machine-readable image reference the MAIN
 * MODEL can pass to the `looklook_see` tool, plus an attachment marker
 * so the plugin's client renders the original image in the chat. The main
 * model decides what to ask the vision model (targeted question or full
 * description, based on the user's question) — no hardcoded rules here.
 *
 * The session log only ever contains harness-native events.
 */
import { contentHasImage } from '@deepseek-ai/dsh-llm';
import { imageRefJson } from "./ref.js";
/** The text the conversation model receives for an image while the eye is off. */
export const PLACEHOLDER_TEXT = '[图片已省略]\n没有开启多模态功能';
/** Marker delimiters the client scans for to render the original image. */
export const IMAGE_MARKER_PREFIX = '【附图:';
export const IMAGE_MARKER_SUFFIX = '】';
/** Hide delimiters: the client strips everything between these two markers. */
export const HIDE_START = '【looklook:开始】';
export const HIDE_END = '【looklook:结束】';
/** Compose the attachment marker appended to the model-visible text. The
 * marker carries the full image reference JSON so the client can render the
 * image at its natural aspect ratio and open it in the native lightbox. */
export function imageMarker(ref) {
    return `\n\n${IMAGE_MARKER_PREFIX}${imageRefJson(ref)}${IMAGE_MARKER_SUFFIX}`;
}
/**
 * Build the model-visible text for one image: a hidden-from-display tool
 * reference (the main model uses it to call `looklook_see`) plus the
 * visible attachment marker that makes the client render the image.
 */
export function buildImageToolReference(image) {
    const ref = image.attachment;
    return [
        HIDE_START,
        '用户发来一张图片，图片内容对你不可见。',
        '图片引用（请原样填入 looklook_see 工具的 source 参数，不要改动）:',
        imageRefJson(ref),
        '要回答与这张图片相关的任何问题，你必须先调用 looklook_see 工具查看图片。',
        HIDE_END,
        imageMarker(ref),
    ].join('\n');
}
/** Replace every image block (including nested tool-result content) with one text block. */
function rewriteContent(blocks, textFor, onImage) {
    const out = [];
    for (const block of blocks) {
        if (block.type === 'image') {
            onImage?.(block);
            out.push({ type: 'text', text: textFor(block) });
        }
        else if (block.type === 'tool-result') {
            out.push({ ...block, content: rewriteContent(block.content, textFor, onImage) });
        }
        else {
            out.push(block);
        }
    }
    return out;
}
function messagesHaveImage(messages) {
    return messages.some(message => contentHasImage(message.content));
}
/** Eye-off path: images become the placeholder (original image still shows in the chat via the marker). */
export function replaceImagesWithPlaceholder(messages) {
    if (!messagesHaveImage(messages))
        return messages;
    return messages.map(message => (contentHasImage(message.content)
        ? {
            ...message,
            content: rewriteContent(message.content, image => PLACEHOLDER_TEXT + imageMarker(image.attachment)),
        }
        : message));
}
/**
 * Eye-on + text-only path: replace every image with its tool reference.
 * Fast (no vision call) so the message appears in the chat immediately.
 * When a registry is given, each image's exact reference is recorded so the
 * describe tool can read the image by the id the user message carries.
 */
export function rewriteImagesToToolReferences(messages, registry) {
    if (!messagesHaveImage(messages))
        return messages;
    const onImage = (image) => {
        registry?.set(String(image.attachment.attachmentId), image.attachment);
    };
    return messages.map(message => (contentHasImage(message.content)
        ? { ...message, content: rewriteContent(message.content, buildImageToolReference, onImage) }
        : message));
}
