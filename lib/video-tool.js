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
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { enabledAudioProviders, enabledProviders } from "./settings.js";
import { chatCompletionsUrl } from "./vision-client.js";
/** The vendored worker's directory (scripts/video-worker next to this file). */
const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'video-worker');
/** The local ASR install root: sibling of the plugin package (same formula as
 * asr-install.ts: lib/ → plugin root → node_modules/…). */
const ASR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'looklook-asr');
/** The local ASR install marker file (set by the one-click installer). */
const LOCAL_ASR_MARKER = join(ASR_DIR, 'ready');
/** The local ASR transcribe script (written by the installer). */
const LOCAL_ASR_SCRIPT = join(ASR_DIR, 'transcribe.py');
/** Per-provider probed capability (keyed by baseURL+model). */
const audioCapabilityCache = new Map();
/** Structured prompt for describing one video frame (vision model). */
const FRAME_PROMPT = '这是一段视频中的一帧画面。请描述：1) 整体场景与氛围 2) 主要人物/主体及其外貌、表情、动作 3) 画面中的文字或标识 4) 艺术风格 5) 光线与色彩。逐项回答，尽量具体，只说画面中真实可见的内容。';
/**
 * Run the vendored Python worker as a subprocess.
 * @param source - local file path or video URL.
 * @param opts - worker options (frames, lang, proxy).
 * @returns the parsed worker JSON.
 */
function runWorker(source, opts, signal, timeoutMs = 600_000) {
    return new Promise((resolveBody, rejectBody) => {
        const outdir = join(WORKER_DIR, '..', '..', 'tmp-worker-out');
        const args = ['worker.py', source, outdir, JSON.stringify(opts)];
        const child = spawn('python3', args, {
            cwd: WORKER_DIR,
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            rejectBody(new Error(`视频分析超时（${Math.round(timeoutMs / 1000)}s）`));
        }, timeoutMs);
        const onAbort = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            child.kill('SIGKILL');
            rejectBody(new Error('视频分析已取消'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            rejectBody(error);
        });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', onAbort);
            if (code !== 0) {
                rejectBody(new Error(stderr.trim().slice(-400) || `worker exited ${code}`));
                return;
            }
            try {
                resolveBody(JSON.parse(stdout));
            }
            catch (error) {
                rejectBody(new Error(`无法解析视频分析结果：${error instanceof Error ? error.message : String(error)}`));
            }
        });
    });
}
/** Extract up to 60s of audio as 16 kHz mono WAV for the audio model. */
async function sampleAudio(videoPath, signal) {
    const tmpDir = join(WORKER_DIR, '..', '..', 'tmp-worker-out');
    const wav = join(tmpDir, 'audio_sample.wav');
    await runFfmpeg(['-y', '-i', videoPath, '-t', '60', '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', wav], signal);
    return wav;
}
/** HIGH route: chat/completions + input_audio (transcript + tone/music/pace). */
async function audioHigh(provider, apiKey, wavPath, question, signal) {
    const data = await readFile(wavPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), provider.timeoutMs ?? 60_000);
    const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal]);
    try {
        const response = await fetch(chatCompletionsUrl(provider.baseURL), {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            redirect: 'error',
            signal: upstream,
            body: JSON.stringify({
                model: provider.model,
                messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: `请听这段视频音频，回答问题：${question}。请同时提供：1) 对白文字（逐句） 2) 说话者的语气/情绪 3) 背景音乐风格与氛围 4) 节奏特点。只输出内容本身。` },
                            { type: 'input_audio', input_audio: { data: data.toString('base64'), format: 'wav' } },
                        ],
                    }],
            }),
        });
        if (response.status === 400 || response.status === 415 || response.status === 422) {
            return { ok: false, reject: true, error: `模型不支持音频输入（HTTP ${response.status}）` };
        }
        if (response.status === 401 || response.status === 403) {
            return { ok: false, reject: false, error: `音频模型鉴权失败（HTTP ${response.status}），请检查 API Key` };
        }
        if (response.status === 404) {
            return { ok: false, reject: false, error: `音频模型不存在（HTTP 404），请检查模型名` };
        }
        if (!response.ok)
            return { ok: false, reject: false, error: `音频理解失败（HTTP ${response.status}）` };
        const text = extractAssistantText(await response.json());
        if (text === '')
            return { ok: false, reject: true, error: '音频模型返回了空内容' };
        return { ok: true, text };
    }
    catch (error) {
        if (signal.aborted)
            return { ok: false, reject: false, error: '已取消' };
        return { ok: false, reject: false, error: error instanceof Error ? error.message : String(error) };
    }
    finally {
        clearTimeout(timeout);
    }
}
/** LOW route: /v1/audio/transcriptions (transcript only). */
async function audioLow(provider, apiKey, wavPath, signal) {
    const data = await readFile(wavPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), provider.timeoutMs ?? 60_000);
    const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal]);
    try {
        const form = new FormData();
        form.append('file', new Blob([data], { type: 'audio/wav' }), 'audio.wav');
        form.append('model', provider.model);
        const base = provider.baseURL.trim().replace(/\/+$/, '');
        const url = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { authorization: `Bearer ${apiKey}` },
            redirect: 'error',
            signal: upstream,
            body: form,
        });
        if (response.status === 400 || response.status === 415 || response.status === 422) {
            return { ok: false, reject: true, error: `转写端点拒绝请求（HTTP ${response.status}）` };
        }
        if (response.status === 401 || response.status === 403) {
            return { ok: false, reject: false, error: `转写鉴权失败（HTTP ${response.status}）` };
        }
        if (!response.ok)
            return { ok: false, reject: false, error: `转写失败（HTTP ${response.status}）` };
        const body = await response.json();
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (text === '')
            return { ok: false, reject: true, error: '转写返回了空内容' };
        return { ok: true, text };
    }
    catch (error) {
        if (signal.aborted)
            return { ok: false, reject: false, error: '已取消' };
        return { ok: false, reject: false, error: error instanceof Error ? error.message : String(error) };
    }
    finally {
        clearTimeout(timeout);
    }
}
/** Local ASR (one-click installed) — LOW route only. */
async function audioLocal(wavPath, signal) {
    return new Promise((resolveBody) => {
        const script = LOCAL_ASR_SCRIPT;
        const child = spawn('python3', [script, wavPath], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            if (code !== 0) {
                resolveBody({ ok: false, error: stderr.trim().slice(-300) || '本地 ASR 失败' });
                return;
            }
            const text = stdout.trim();
            resolveBody(text === '' ? { ok: false, error: '本地 ASR 返回空内容' } : { ok: true, text });
        });
        signal.addEventListener('abort', () => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            resolveBody({ ok: false, error: '已取消' });
        }, { once: true });
    });
}
/**
 * Capability-probed audio understanding: HIGH first, fall back to LOW only on
 * format rejection; remembers the probe per provider. Returns null when no
 * audio path is available or nothing is configured/installed.
 */
async function understandAudio(providers, resolveApiKey, audioPath, question, signal) {
    const wavPath = await sampleAudio(audioPath, signal);
    for (const provider of providers) {
        const key = `${provider.baseURL}|${provider.model}`;
        const cached = audioCapabilityCache.get(key) ?? 'unknown';
        const apiKey = await resolveApiKey(provider.apiKeyEnv);
        if (apiKey === undefined)
            continue;
        if (cached !== 'low') {
            const high = await audioHigh(provider, apiKey, wavPath, question, signal);
            if (high.ok) {
                audioCapabilityCache.set(key, 'high');
                return { ok: true, high: true, text: high.text };
            }
            if (high.reject) {
                audioCapabilityCache.set(key, 'low');
            }
            else {
                return { ok: false, high: cached === 'unknown', error: high.error };
            }
        }
        const low = await audioLow(provider, apiKey, wavPath, signal);
        if (low.ok) {
            audioCapabilityCache.set(key, 'low');
            return { ok: true, high: false, text: low.text };
        }
        if (!low.reject)
            return { ok: false, high: false, error: low.error };
    }
    // No usable API provider — try the local one-click ASR install.
    const localOk = await import('node:fs').then(fs => fs.promises.access(LOCAL_ASR_MARKER).then(() => true).catch(() => false));
    if (localOk) {
        const local = await audioLocal(wavPath, signal);
        if (local.ok)
            return { ok: true, high: false, text: local.text };
    }
    return null;
}
/** Run one ffmpeg command (used for audio sampling). */
function runFfmpeg(args, signal) {
    return new Promise((resolveBody, rejectBody) => {
        const child = spawn('ffmpeg', [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        let settled = false;
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('error', rejectBody);
        child.on('close', (code) => {
            if (settled)
                return;
            settled = true;
            if (code === 0)
                resolveBody();
            else
                rejectBody(new Error(stderr.trim().slice(-300) || 'ffmpeg failed'));
        });
        signal.addEventListener('abort', () => {
            if (settled)
                return;
            settled = true;
            child.kill('SIGKILL');
            rejectBody(new Error('音频采样已取消'));
        }, { once: true });
    });
}
/**
 * Extract the assistant's answer from a chat-completions response. Some
 * endpoints (e.g. aplan-vl → sensenova-flash-lite) put the answer in
 * `message.reasoning` and leave `content` empty; accept both.
 */
function extractAssistantText(body) {
    const choice = body?.choices?.[0];
    const message = choice?.message;
    if (message === undefined)
        return '';
    for (const field of ['content', 'reasoning']) {
        const value = message[field];
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim();
    }
    return '';
}
/** Describe one frame with the vision model (structured prompt). */
async function describeFrame(providers, resolveApiKey, framePath, at, signal) {
    for (const provider of providers) {
        const apiKey = await resolveApiKey(provider.apiKeyEnv);
        if (apiKey === undefined)
            continue;
        try {
            const data = await readFile(framePath);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(new Error('vision timeout')), provider.timeoutMs ?? 30_000);
            const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal]);
            const response = await fetch(chatCompletionsUrl(provider.baseURL), {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
                redirect: 'error',
                signal: upstream,
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: FRAME_PROMPT },
                                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data.toString('base64')}` } },
                            ],
                        }],
                    max_tokens: 400,
                }),
            });
            clearTimeout(timeout);
            if (!response.ok)
                continue;
            const text = extractAssistantText(await response.json());
            if (text !== '')
                return `第${Math.round(at)}秒：${text}`;
        }
        catch {
            // try the next provider
        }
    }
    return `第${Math.round(at)}秒：（画面描述失败，帧路径 ${framePath}）`;
}
/** Compose the model-visible report from worker output + audio + frames. */
function composeReport(out, question, audio, frameDescs) {
    const parts = [];
    if (out.meta !== undefined && Object.keys(out.meta).length > 0) {
        const m = out.meta;
        parts.push([
            `视频标题：${m.title ?? '未知'}`,
            m.uploader !== undefined ? `UP主/作者：${m.uploader}` : '',
            typeof m.duration === 'number' && m.duration > 0 ? `时长：${Math.round(m.duration)}秒` : '',
            m.source === 'local-file' ? `文件：${m.path}` : m.webpage_url !== undefined ? `链接：${m.webpage_url}` : '',
        ].filter(Boolean).join('\n'));
    }
    if (out.transcript !== null && out.transcript !== undefined) {
        const source = out.transcript.source === 'subtitle' ? '字幕' : '语音识别';
        const lang = out.transcript.language ?? '';
        parts.push(`【配音稿（${source}${lang ? ` / ${lang}` : ''}）】\n${out.transcript.text?.trim() ?? ''}`.trim());
    }
    if (audio !== null && audio !== undefined) {
        parts.push(audio.ok
            ? `【声音理解${audio.high === true ? '（含语气/音乐/节奏）' : ''}】${audio.text}`
            : `【声音理解】${audio.error ?? '不可用'}`);
    }
    if (frameDescs.length > 0) {
        parts.push(`【画面时间线】\n${frameDescs.join('\n')}`);
    }
    parts.push(`【用户问题】${question}`);
    return parts.join('\n\n');
}
/**
 * Watch and analyze a video (local file path or URL) — the video branch of
 * the unified looklook_see tool.
 * @returns the composed report text (or a failure message).
 */
export async function watchVideo(ctx, audioScope, visionScope, videoRecognitionEnabled, source, question, signal) {
    if (!videoRecognitionEnabled()) {
        return '视频识别已关闭：请在插件设置中开启「识别视频」后使用。';
    }
    if (source === '')
        return '看视频失败：缺少 source 参数（视频文件路径或链接）';
    const isUrl = /^https?:\/\//.test(source);
    try {
        const workerOut = await runWorker(source, {
            transcript: true,
            frames: 10,
            lang: 'zh',
            ...(isUrl ? { proxy: process.env.DISCORD_PROXY } : {}),
        }, signal);
        if (!workerOut.ok) {
            return `看视频失败：${workerOut.error ?? '未知错误'}`;
        }
        const credentials = ctx.get('credentials');
        const resolveApiKey = async (ref) => {
            if (credentials === undefined)
                return undefined;
            const resolvedCred = await credentials.resolve(credentialRef(ref));
            return resolvedCred?.value;
        };
        // Audio understanding: probe capability, HIGH then LOW, then local.
        let audio = null;
        const audioPath = workerOut.audio_path ?? workerOut.video_path;
        if (audioPath !== undefined && audioPath !== '' && workerOut.transcript === null) {
            audio = await understandAudio(enabledAudioProviders(audioScope), resolveApiKey, audioPath, question, signal);
        }
        // Frames → vision model (画面时间线).
        const frameDescs = [];
        const visionProviders = enabledProviders(visionScope);
        for (const frame of workerOut.frames ?? []) {
            frameDescs.push(await describeFrame(visionProviders, resolveApiKey, frame.path, frame.time, signal));
        }
        return composeReport(workerOut, question, audio, frameDescs);
    }
    catch (error) {
        return `看视频失败：${error instanceof Error ? error.message : String(error)}`;
    }
}
