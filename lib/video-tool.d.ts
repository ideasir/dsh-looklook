/**
 * dsh-looklook/video — the `looklook_see` video branch: understand a video, whether
 * it was uploaded as a local file (session `.uploads/`) or referenced by a
 * URL (Bilibili / YouTube / Douyin / generic via the vendored Python worker).
 *
 * Pipeline (all text flows to the text-only main model):
 *   1. vendor worker.py extracts metadata + transcript (platform/embedded
 *      subtitles first; else it prepares an audio file) + frames.
 *   2. Audio understanding (L2+L3 merged, capability-probed, no user label):
 *      - if an audio API provider is configured, try the HIGH route first
 *        (chat/completions + input_audio → transcript + tone + music + pace
 *        in one call); on a format rejection fall back to the LOW route
 *        (/v1/audio/transcriptions → transcript only). The probed capability
 *        is remembered per provider to avoid repeating the failed attempt.
 *      - else, if the local ASR install exists, use it (transcript only).
 *      - else, no audio understanding (subtitles only).
 *   3. Frames are described by the vision model (each frame, structured
 *      prompt) and returned as a "画面时间线" so the main model sees what
 *      happened visually instead of bare image paths.
 *
 * All external calls are subprocesses of the vendored worker or direct HTTP;
 * missing dependencies surface as classified messages instead of a crash.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AudioScope, VisionScope } from './settings.ts';
/**
 * Resolve the machine's configured outbound proxy without exposing its value.
 * DISCORD_PROXY is kept first for backwards compatibility; standard proxy
 * variables cover YouTube and other external video sites.
 */
export declare function configuredVideoProxy(env?: NodeJS.ProcessEnv): string | undefined;
/**
 * Watch and analyze a video (local file path or URL) — the video branch of
 * the unified looklook_see tool.
 * @returns the composed report text (or a failure message).
 */
export declare function watchVideo(ctx: Context, audioScope: AudioScope, visionScope: VisionScope, source: string, question: string, signal: AbortSignal): Promise<string>;
