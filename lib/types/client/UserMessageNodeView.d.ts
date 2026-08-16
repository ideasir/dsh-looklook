/**
 * LooklookUserMessageNodeView — replaces the default user-message bubble so
 * the chat renders the ORIGINAL image the user sent, even though the session
 * record only carries the plugin's rewritten text (rc.6 rewrites the record).
 *
 * Thumbnail rule (fixed size): square → 220×220; landscape → height 220;
 * portrait → width 220 (aspect-preserving, never upscaled). Click opens the
 * native lightbox. The host embeds a full image-reference JSON in the marker
 * 「【附图:{...}】」 and wraps its model-facing tool-reference text in
 * 「【looklook:开始】…【looklook:结束】」 (hidden from the user). Defensive:
 * unexpected shapes fall back to plain text, never crashing the chat.
 */
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
interface UserMessageNodeProps {
    node?: {
        data?: {
            content?: unknown;
        };
    };
    loadImage?: (attachment: ImageAttachmentRef) => Promise<string>;
}
/**
 * Defensive user-message renderer: fixed-size thumbnails + native lightbox,
 * only the user's own text shown; falls back to plain text on unexpected shapes.
 * The fallback ALWAYS strips looklook markers (hidden ranges + file/image
 * markers) so raw marker code never flashes before the structured render.
 */
export declare function LooklookUserMessageNodeView(props: UserMessageNodeProps): import("react").JSX.Element | null;
export {};
