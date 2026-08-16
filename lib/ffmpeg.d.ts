/**
 * dsh-looklook/ffmpeg — thin wrapper around the system ffmpeg/ffprobe for
 * video understanding:
 * - probe a video's streams (duration, audio presence, subtitle tracks);
 * - extract frames for the vision model (L1 画面);
 * - extract the audio track as 16 kHz mono WAV for ASR / audio models (L2/L3);
 * - export a subtitle track to SRT text when present (cheapest L2 path).
 *
 * Depends on ffmpeg/ffprobe being installed on the host (checked at runtime;
 * a missing binary yields a classified error instead of crashing).
 */
/** Result of probing one video file. */
export interface VideoProbe {
    /** Duration in seconds (0 when unknown). */
    duration: number;
    /** Whether the file has at least one audio stream. */
    hasAudio: boolean;
    /** Whether the file has at least one subtitle stream. */
    hasSubtitles: boolean;
    /** Width in pixels (0 when unknown). */
    width: number;
    /** Height in pixels (0 when unknown). */
    height: number;
}
/** One extracted frame, staged in a temp directory. */
export interface FrameImage {
    /** Absolute path to the frame image file (JPEG). */
    path: string;
    /** Seconds into the video this frame was taken. */
    at: number;
}
/** One subtitle entry (SRT cue). */
export interface SubtitleCue {
    /** Start time in seconds. */
    start: number;
    /** End time in seconds. */
    end: number;
    /** Plain text content (newlines joined by space). */
    text: string;
}
/** Check that the ffmpeg binaries are available on PATH. */
export declare function ffmpegAvailable(): Promise<boolean>;
/** Probe one video file's streams with ffprobe. */
export declare function probeVideo(path: string): Promise<VideoProbe>;
/**
 * Extract evenly spaced frames from a video.
 * @param path - the video file.
 * @param maxFrames - cap on frames (default 8).
 * @returns staged frame files; the caller owns the temp dir until cleanup.
 */
export declare function extractFrames(path: string, maxFrames?: number): Promise<{
    frames: FrameImage[];
    tempDir: string;
}>;
/**
 * Extract the audio track as a 16 kHz mono WAV (the format ASR and audio
 * models expect). Returns the temp file path; the caller owns cleanup.
 */
export declare function extractAudio(path: string): Promise<{
    wavPath: string;
    tempDir: string;
}>;
/**
 * Export a subtitle track to SRT text.
 * @param path - the video file.
 * @returns parsed subtitle cues, or [] when the file has no subtitle stream.
 */
export declare function extractSubtitles(path: string): Promise<SubtitleCue[]>;
/** Parse SRT text into cues (lenient: skips malformed blocks). */
export declare function parseSrt(raw: string): SubtitleCue[];
