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
import type { ImageBlock, Message } from '@deepseek-ai/dsh-llm';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
/** The text the conversation model receives for an image while the eye is off. */
export declare const PLACEHOLDER_TEXT = "[\u56FE\u7247\u5DF2\u7701\u7565]\n\u6CA1\u6709\u5F00\u542F\u591A\u6A21\u6001\u529F\u80FD";
/** Marker delimiters the client scans for to render the original image. */
export declare const IMAGE_MARKER_PREFIX = "\u3010\u9644\u56FE:";
export declare const IMAGE_MARKER_SUFFIX = "\u3011";
/** Hide delimiters: the client strips everything between these two markers. */
export declare const HIDE_START = "\u3010looklook:\u5F00\u59CB\u3011";
export declare const HIDE_END = "\u3010looklook:\u7ED3\u675F\u3011";
/** Compose the attachment marker appended to the model-visible text. The
 * marker carries the full image reference JSON so the client can render the
 * image at its natural aspect ratio and open it in the native lightbox. */
export declare function imageMarker(ref: ImageAttachmentRef): string;
/**
 * Build the model-visible text for one image: a hidden-from-display tool
 * reference (the main model uses it to call `looklook_see`) plus the
 * visible attachment marker that makes the client render the image.
 */
export declare function buildImageToolReference(image: ImageBlock): string;
/** Eye-off path: images become the placeholder (original image still shows in the chat via the marker). */
export declare function replaceImagesWithPlaceholder(messages: readonly Message[]): Message[];
/**
 * Eye-on + text-only path: replace every image with its tool reference.
 * Fast (no vision call) so the message appears in the chat immediately.
 * When a registry is given, each image's exact reference is recorded so the
 * describe tool can read the image by the id the user message carries.
 */
export declare function rewriteImagesToToolReferences(messages: readonly Message[], registry?: Map<string, ImageAttachmentRef>): Message[];
