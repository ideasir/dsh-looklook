/**
 * dsh-looklook/asr-install — local ASR one-click install support.
 *
 * The local ASR (faster-whisper + a small wrapper script) lives OUTSIDE the
 * plugin package, under `<plugin>/../looklook-asr/` — it is machine-local
 * state, never shipped in the tarball. Install steps:
 *   1. env check: python3 + ffmpeg present;
 *   2. pip install faster-whisper (system packages allowed — PEP 668);
 *   3. download the model (medium) via HF mirror;
 *   4. write transcribe.py + a `ready` marker.
 *
 * Routes:
 *   GET  /api/looklook-asr-status   → { installed, phase, model }
 *   POST /api/looklook-asr-install  → starts the install (idempotent)
 */
import type { Context } from '@deepseek-ai/cordis';
/** The transcribe wrapper script (invoked by the video tool). */
export declare const TRANSCRIBE_SCRIPT: string;
/** The ASR model id (fixed: medium — good accuracy on CPU). */
export declare const LOCAL_ASR_MODEL = "medium";
/** Current install phase, reported by GET status. */
export type AsrInstallPhase = 'none' | 'checking' | 'installing-deps' | 'downloading-model' | 'writing' | 'done' | 'failed';
/** Whether the local ASR install is complete (ready marker exists). */
export declare function localAsrReady(): Promise<boolean>;
/** Register the ASR install routes. */
export declare function registerAsrInstallRoutes(ctx: Context): void;
/** Read the ready marker (for tests). */
export declare function readReadyMarker(): Promise<string | undefined>;
