/**
 * looklook_describe — the tool that makes a text-only model "pseudo-native
 * multimodal". The MAIN MODEL decides what to ask the vision model: it passes
 * an image reference (from the user message) plus whatever question it judges
 * appropriate for the user's request (targeted question or full description).
 * No hardcoded rules about what the vision model must output.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { VisionScope, LooklookScope } from './settings.ts';
/** Register the describe tool; refRegistry is populated as images arrive. */
export declare function registerDescribeTool(ctx: Context, scope: VisionScope, refRegistry: Map<string, ImageAttachmentRef>, features: LooklookScope): void;
