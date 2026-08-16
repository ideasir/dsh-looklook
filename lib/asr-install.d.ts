/**
 * dsh-looklook/asr-install — local ASR one-click install support.
 *
 * The local ASR (faster-whisper + a small wrapper script) lives OUTSIDE the
 * plugin package, under `<dshHome>/looklook-asr/` (machine-local state, never
 * shipped in the tarball and never wiped by a package reinstall). Install
 * steps:
 *   1. env check: python3 + ffmpeg present;
 *   2. pip install faster-whisper (system packages allowed — PEP 668);
 *   3. download the model (medium) via HF mirror;
 *   4. write transcribe.py + a `ready` marker.
 *
 * The trigger/status are exposed as Remote RPCs on `remote.looklook`
 * (asrStatus / asrInstall) — no unauth'd HTTP routes.
 */
/** The transcribe wrapper script (invoked by the video tool). */
export declare const TRANSCRIBE_SCRIPT: string;
/** The ASR model id (fixed: medium — good accuracy on CPU). */
export declare const LOCAL_ASR_MODEL = "medium";
/** Current install phase, reported by GET status. */
export type AsrInstallPhase = 'none' | 'checking' | 'installing-deps' | 'downloading-model' | 'writing' | 'done' | 'failed';
/** Whether the local ASR install is complete (ready marker exists). */
export declare function localAsrReady(): Promise<boolean>;
/** Run the full install; updates installState as it goes. Re-entrant calls
 * (two concurrent asrInstall RPCs) are refused: the second call sees the
 * non-'none' phase and returns already:true, so performInstall itself only
 * ever runs one pipeline. */
export declare function performInstall(): Promise<void>;
/** Read the ready marker (for tests). */
export declare function readReadyMarker(): Promise<string | undefined>;
/** Read the current in-memory install phase (for the status RPC). */
export declare function currentInstallPhase(): AsrInstallPhase;
/** Read the last install error, if any. */
export declare function currentInstallError(): string | null;
