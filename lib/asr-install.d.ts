/**
 * dsh-looklook/asr-install — local ASR one-click install support.
 *
 * The local ASR (faster-whisper + a small wrapper script) lives OUTSIDE the
 * plugin package, under `<dshHome>/looklook-asr/` (machine-local state, never
 * shipped in the tarball and never wiped by a package reinstall). Install
 * steps:
 *   1. env check: python3 + ffmpeg present;
 *   2. create an ISOLATED venv at `<dshHome>/looklook-venv` so nothing
 *      touches the system Python;
 *   3. pip install faster-whisper INTO the venv;
 *   4. download the chosen model (tiny/base/small/medium/large-v3) via the
 *      HF mirror (hf-mirror.com — direct huggingface.co times out in many
 *      regions);
 *   5. write transcribe.py + a `ready` marker (transcribe.py runs with the
 *      venv's own python).
 *
 * The model is EXCLUSIVE: installing a new size removes the previously
 * downloaded model (faster-whisper caches under `~/.cache/huggingface/hub`),
 * so only one model ever occupies disk.
 *
 * The trigger/status are exposed as Remote RPCs on `remote.looklook`
 * (asrStatus / asrInstall) — no unauth'd HTTP routes.
 */
/** The isolated Python venv for the plugin's packages (ASR + yt-dlp). */
export declare const VENV_DIR: string;
/** The transcribe wrapper script (invoked by the video tool). */
export declare const TRANSCRIBE_SCRIPT: string;
/** One selectable local-ASR model size. */
export interface AsrModelOption {
    /** faster-whisper model id (also the download name). */
    id: string;
    /** Display name. */
    name: string;
    /** Human size label. */
    sizeLabel: string;
    /** Approximate download size in bytes (for the picker). */
    bytes: number;
}
/** The selectable ASR models, smallest first. */
export declare const ASR_MODEL_OPTIONS: AsrModelOption[];
/** Default model when the caller does not choose (small — good CPU speed/accuracy). */
export declare const DEFAULT_ASR_MODEL = "small";
/** Current install phase, reported by GET status. */
export type AsrInstallPhase = 'none' | 'checking' | 'installing-deps' | 'downloading-model' | 'writing' | 'done' | 'failed';
/** Resolve a model option by id; undefined when unknown. */
export declare function asrModelOption(id: string): AsrModelOption | undefined;
/**
 * Create (once) the plugin's isolated venv and return its python executable.
 * POSIX: <venv>/bin/python ; Windows: <venv>/Scripts/python.exe.
 * Returns undefined when the venv cannot be created.
 */
export declare function ensureVenv(basePython: string, venvDir: string): Promise<string | undefined>;
/** Whether the local ASR install is complete (ready marker exists). */
export declare function localAsrReady(): Promise<boolean>;
/** Read the installed model id from the marker (undefined when none). */
export declare function installedAsrModel(): Promise<string | undefined>;
/** Run the full install for one model id; updates installState as it goes.
 * Re-entrant calls (two concurrent asrInstall RPCs) are refused: the second
 * call sees the non-'none' phase and returns already:true. */
export declare function performInstall(modelId?: string): Promise<void>;
/** Read the ready marker (for tests). */
export declare function readReadyMarker(): Promise<string | undefined>;
/** Read the current in-memory install phase (for the status RPC). */
export declare function currentInstallPhase(): AsrInstallPhase;
/** Read the last install error, if any. */
export declare function currentInstallError(): string | null;
