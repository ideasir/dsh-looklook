/**
 * Image recognition logic for looklook ("look at anything").
 *
 * The MAIN MODEL decides what to ask the vision model: it passes an image
 * reference or file path plus whatever question it judges appropriate. The
 * unified looklook_see tool dispatches here for image sources.
 *
 * Files are read through the `fs` service so the sandbox policy applies
 * (a bare readFile would let the model exfiltrate any path it names).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { VisionScope } from './settings.ts';
/**
 * Describe one image — a local file path, an image URL, or a legacy image
 * reference (JSON or bare attachment id from an old session record) — using
 * the vision model.
 * @param cwd - the session working directory (resolves relative paths).
 * @returns the description text (or a failure message).
 */
export declare function describeImageFile(ctx: Context, scope: VisionScope, source: string, question: string, signal: AbortSignal, cwd?: string): Promise<string>;
