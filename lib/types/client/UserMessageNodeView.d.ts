/**
 * LooklookUserMessageNodeView — replaces the default user-message bubble so
 * the chat renders the ORIGINAL image the user sent, even though the session
 * record only carries the plugin's rewritten text (rc.6 rewrites the record).
 *
 * The host embeds a full image-reference JSON in the marker 「【附图:{...}】」
 * and wraps its model-facing tool-reference text in
 * 「【looklook:开始】…【looklook:结束】」 (hidden from the user). This view
 * renders the image with the harness's native ImageGallery (click to enlarge
 * in the lightbox) and shows only the user's own question text. Native image
 * blocks (multimodal models / newer harnesses) render the same way. The
 * component is defensive: unexpected shapes fall back to plain text.
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
 * Defensive user-message renderer: renders the image (marker/native) with the
 * native gallery + lightbox, shows only the user's own text; falls back to
 * plain text on unexpected shapes.
 */
export declare function LooklookUserMessageNodeView(props: UserMessageNodeProps): import("react").JSX.Element | null;
export {};
