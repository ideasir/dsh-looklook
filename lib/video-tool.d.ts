/**
 * dsh-looklook/video — the `looklook_watch` tool: understand a video, whether
 * it was uploaded as a local file (session `.uploads/`) or referenced by a
 * URL (Bilibili / YouTube / Douyin / generic via the vendored Python worker).
 *
 * Pipeline (all text flows to the text-only main model):
 *   1. vendor worker.py extracts metadata + transcript (platform subtitles
 *      first, else local faster-whisper ASR) + evenly spaced frames.
 *   2. When L3 audio understanding is configured (audioUnderstanding switch
 *      AND an audio-capable provider), a sample of the audio track is sent
 *      to the audio model for tone/music/pace; otherwise route A (transcript
 *      only) applies and the L3 block is omitted.
 *   3. Frames are staged on disk; their paths are returned so the main model
 *      can ask for a closer look (or the vision model can be extended later).
 *
 * All external calls are subprocesses of the vendored worker; missing Python
 * deps surface as a classified message instead of a crash.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AudioScope } from './settings.ts';
/** Register the looklook_watch tool. */
export declare function registerWatchTool(ctx: Context, audioScope: AudioScope): void;
