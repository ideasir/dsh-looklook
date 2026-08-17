/**
 * looklook_see — the unified "look at anything" tool.
 *
 * One tool name for every content type; the tool itself decides how to look:
 * - local image file → vision model;
 * - local video file or video URL → frames + audio understanding;
 * - ZIP archive → list its contents;
 * - document files (.docx/.xlsx/.pptx/.pdf/.psd) → extracted digest.
 *
 * The main model only needs to remember ONE tool for understanding content:
 * looklook_see(source, question). (process_zip stays separate for the
 * extract operation, which changes the filesystem rather than understanding
 * content.)
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AudioScope, LooklookScope, VisionScope } from './settings.ts';
/** Register the unified looklook_see tool. */
export declare function registerSeeTool(ctx: Context, visionScope: VisionScope, audioScope: AudioScope, features: LooklookScope): void;
