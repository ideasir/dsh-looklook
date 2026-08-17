/**
 * dsh-looklook/env-check — environment self-check for the plugin's external
 * dependencies, plus one-click repair for the pieces that can be fixed from
 * inside the plugin (Python packages). System-level installs (Python itself,
 * ffmpeg) are reported with concrete guidance instead of being auto-installed.
 *
 * Checks:
 * - Python runtime (python3 / python / py) — required by the video worker and
 *   the local ASR install;
 * - ffmpeg — required by video frame extraction / audio sampling;
 * - yt-dlp (Python package) — required by video-URL analysis; **repairable**
 *   via `python -m pip install yt-dlp`;
 * - local ASR install (faster-whisper + ready marker) — repairable via the
 *   existing one-click ASR installer.
 */
/** One dependency check result. */
export interface EnvCheckItem {
    /** Stable id for the client to key UI on. */
    id: string;
    /** Human-readable label (Chinese). */
    label: string;
    /** 'ok' = present/working; 'missing' = not found; 'error' = probe failed. */
    status: 'ok' | 'missing' | 'error';
    /** Short status text for the dialog (e.g. the detected version). */
    detail: string;
    /** Whether this item can be repaired with a one-click action. */
    repairable: boolean;
    /** One-click repair action id (only when repairable). */
    repairAction?: 'install-yt-dlp' | 'install-asr';
    /** Guidance shown when the item is missing and not repairable. */
    guidance?: string;
}
/** The full environment report returned to the settings dialog. */
export interface EnvCheckReport {
    ok: boolean;
    items: EnvCheckItem[];
    /** A one-line summary for the dialog title. */
    summary: string;
}
/** Repair one action. Returns the new per-item state. */
export declare function repairEnv(action: 'install-yt-dlp' | 'install-asr'): Promise<EnvCheckItem>;
/** Build the full environment report. */
export declare function runEnvCheck(): Promise<EnvCheckReport>;
