/**
 * Image → text translation for text-only conversation models, and the
 * eye-off placeholder path. Translation results are cached in the session log
 * as `vision/describe` events (keyed by attachment id), so the same image is
 * recognized once and replayed from the log on later requests.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Message } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { VisionScope } from './settings.ts';
import { statusMessage, type DescribeResult } from './vision-client.ts';
/** The text the conversation model receives for an image while the eye is off. */
export declare const PLACEHOLDER_TEXT = "[\u56FE\u7247\u5DF2\u7701\u7565]\n\u6CA1\u6709\u5F00\u542F\u591A\u6A21\u6001\u529F\u80FD";
/** Compose the model-visible text for one recognition result (all Chinese). */
export declare function describeResultText(result: DescribeResult): string;
/** Eye-off path: images become the placeholder; nothing else changes. */
export declare function replaceImagesWithPlaceholder(messages: readonly Message[]): Message[];
/** Eye-on, text-only path: describe every image and replace it with the result text. */
export declare function translateImages(ctx: Context, messages: readonly Message[], sessionId: SessionId | undefined, scope: VisionScope, signal: AbortSignal | undefined): Promise<Message[]>;
export { statusMessage };
