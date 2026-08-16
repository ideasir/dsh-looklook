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
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
/** The ffmpeg executable name (PATH lookup). */
const FFMPEG = 'ffmpeg';
/** The ffprobe executable name (PATH lookup). */
const FFPROBE = 'ffprobe';
/** Run one ffmpeg/ffprobe command and collect stdout/stderr. */
function run(bin, args, timeoutMs = 120_000) {
    return new Promise((resolveBody, rejectBody) => {
        const child = spawn(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            rejectBody(new Error(`${bin} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            rejectBody(error);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (code === 0)
                resolveBody({ stdout, stderr });
            else
                rejectBody(new Error(`${bin} exited ${code}: ${stderr.trim().slice(-500) || '(no output)'}`));
        });
    });
}
/** Check that the ffmpeg binaries are available on PATH. */
export async function ffmpegAvailable() {
    try {
        await run(FFMPEG, ['-version'], 10_000);
        await run(FFPROBE, ['-version'], 10_000);
        return true;
    }
    catch {
        return false;
    }
}
/** Probe one video file's streams with ffprobe. */
export async function probeVideo(path) {
    const { stdout } = await run(FFPROBE, [
        '-v', 'error',
        '-show_entries', 'stream=codec_type:format=duration',
        '-of', 'json',
        path,
    ], 30_000);
    const parsed = JSON.parse(stdout);
    const streams = parsed.streams ?? [];
    const video = streams.find(stream => stream.codec_type === 'video');
    return {
        duration: Number(parsed.format?.duration) || 0,
        hasAudio: streams.some(stream => stream.codec_type === 'audio'),
        hasSubtitles: streams.some(stream => stream.codec_type === 'subtitle'),
        width: video?.width ?? 0,
        height: video?.height ?? 0,
    };
}
/**
 * Extract evenly spaced frames from a video.
 * @param path - the video file.
 * @param maxFrames - cap on frames (default 8).
 * @returns staged frame files; the caller owns the temp dir until cleanup.
 */
export async function extractFrames(path, maxFrames = 8) {
    const probe = await probeVideo(path);
    const duration = probe.duration;
    const count = duration > 0 ? Math.min(maxFrames, Math.max(1, Math.floor(duration))) : 1;
    const tempDir = await mkdtemp(join(tmpdir(), 'looklook-frames-'));
    try {
        if (duration <= 0 || count <= 1) {
            // Unknown duration / single frame: grab one frame at 0.1s.
            const out = join(tempDir, 'frame_0001.jpg');
            await run(FFMPEG, ['-y', '-ss', '0.1', '-i', path, '-frames:v', '1', '-q:v', '3', out], 60_000);
            return { frames: [{ path: out, at: 0 }], tempDir };
        }
        const interval = duration / count;
        const frames = [];
        for (let i = 0; i < count; i++) {
            const at = Math.min(duration - 0.1, i * interval);
            const out = join(tempDir, `frame_${String(i + 1).padStart(4, '0')}.jpg`);
            await run(FFMPEG, ['-y', '-ss', String(at), '-i', path, '-frames:v', '1', '-q:v', '3', out], 60_000);
            frames.push({ path: out, at });
        }
        return { frames, tempDir };
    }
    catch (error) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
        throw error;
    }
}
/**
 * Extract the audio track as a 16 kHz mono WAV (the format ASR and audio
 * models expect). Returns the temp file path; the caller owns cleanup.
 */
export async function extractAudio(path) {
    const tempDir = await mkdtemp(join(tmpdir(), 'looklook-audio-'));
    const wavPath = join(tempDir, 'audio.wav');
    try {
        await run(FFMPEG, ['-y', '-i', path, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', wavPath], 120_000);
        return { wavPath, tempDir };
    }
    catch (error) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
        throw error;
    }
}
/**
 * Export a subtitle track to SRT text.
 * @param path - the video file.
 * @returns parsed subtitle cues, or [] when the file has no subtitle stream.
 */
export async function extractSubtitles(path) {
    const probe = await probeVideo(path);
    if (!probe.hasSubtitles)
        return [];
    const tempDir = await mkdtemp(join(tmpdir(), 'looklook-subs-'));
    const srtPath = join(tempDir, 'out.srt');
    try {
        await run(FFMPEG, ['-y', '-i', path, '-map', '0:s:0', srtPath], 60_000);
        const raw = await readFile(srtPath, 'utf8');
        return parseSrt(raw);
    }
    catch {
        // Some subtitle codecs (e.g. PGS/HDMV) cannot be exported to SRT; treat
        // as no subtitles rather than failing the whole video.
        return [];
    }
    finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
}
/** Parse SRT text into cues (lenient: skips malformed blocks). */
export function parseSrt(raw) {
    const cues = [];
    const blocks = raw.split(/\r?\n\r?\n+/);
    for (const block of blocks) {
        const lines = block.split(/\r?\n/);
        if (lines.length < 2)
            continue;
        const timing = lines.find(line => line.includes('-->'));
        if (timing === undefined)
            continue;
        const match = timing.match(/(\d{1,2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2}),(\d{3})/);
        if (match === null)
            continue;
        const [h1, m1, s1, ms1, h2, m2, s2, ms2] = match.slice(1);
        if (h1 === undefined || m1 === undefined || s1 === undefined || ms1 === undefined
            || h2 === undefined || m2 === undefined || s2 === undefined || ms2 === undefined)
            continue;
        const text = lines.slice(lines.indexOf(timing) + 1).join(' ').trim();
        if (text === '')
            continue;
        cues.push({
            start: srtStampToSeconds(h1, m1, s1, ms1),
            end: srtStampToSeconds(h2, m2, s2, ms2),
            text,
        });
    }
    return cues;
}
/** Convert an SRT timecode (HH MM SS mmm as strings) to seconds. */
function srtStampToSeconds(h, m, s, ms) {
    return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}
