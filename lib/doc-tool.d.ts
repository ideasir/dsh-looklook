/**
 * dsh-looklook/doc — document branch of looklook_see: Word/Excel/PPT/PDF/PSD.
 *
 * Logic per content type (not hardcoded rules — judged from the parse):
 * - .docx / .xlsx: extract text/tables; describe embedded images via the
 *   vision model when configured.
 * - .pptx: per-slide text + images; each slide's images are described IN
 *   CONTEXT of that slide's text (the "文字和图片配合" link); if the deck
 *   carries background music, the audio model identifies it ONCE (has music,
 *   style/genre, name if known) — never per-slide.
 * - .pdf: per-page text; scan pages (little text, real imagery) are
 *   described via the vision model.
 * - .psd: layer tree; optional whole-design vision description and single
 *   layer extraction as a transparent PNG attachment.
 *
 * The vision config is looklook's `vision` namespace (shared with image and
 * video recognition — no separate docreader config). Files are read through
 * the `fs` service so sandbox policy applies.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { VisionScope, AudioScope } from './settings.ts';
/** Whether a source path is a document file looklook_see should route here. */
export declare function isDocumentPath(path: string): boolean;
/**
 * Read and analyze a document file — the document branch of looklook_see.
 * @param source - the document file path.
 * @param question - the user's question (passed through, model-facing).
 * @returns the digest text (or a failure message).
 */
export declare function readDocumentFile(ctx: Context, visionScope: VisionScope, audioScope: AudioScope, source: string, question: string, cwd: string | undefined, signal: AbortSignal): Promise<string>;
