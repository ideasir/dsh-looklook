/**
 * Shared Python runtime detection for dsh-looklook.
 *
 * The ASR installer and the video worker both spawn Python. The executable
 * name differs across environments (python3 on most Linux/macOS, `python` on
 * some minimal installs, `py` on Windows), so we probe once per process and
 * remember the winner. The failure message names the likely fix instead of
 * just echoing `ENOENT`.
 */
/** One probe result. */
interface ProbeResult {
    ok: boolean;
    /** The working executable path/name, when found. */
    command: string | undefined;
    /** Human-readable failure (why nothing worked). */
    error: string | undefined;
}
/** Detect a usable Python runtime (cached per process). */
export declare function detectPython(): Promise<ProbeResult>;
/** Reset the cached probe (used by tests / hot reload). */
export declare function resetPythonDetection(): void;
export {};
