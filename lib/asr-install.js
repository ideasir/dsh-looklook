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
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/** The local ASR root: <plugin root>/../looklook-asr. */
const ASR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'looklook-asr');
/** The ready marker: written only after a successful install. */
const READY_MARKER = join(ASR_DIR, 'ready');
/** The transcribe wrapper script (invoked by the video tool). */
export const TRANSCRIBE_SCRIPT = join(ASR_DIR, 'transcribe.py');
/** The ASR model id (fixed: medium — good accuracy on CPU). */
export const LOCAL_ASR_MODEL = 'medium';
/** In-memory install progress (single installer at a time). */
let installState = { phase: 'none' };
/** Whether the local ASR install is complete (ready marker exists). */
export async function localAsrReady() {
    try {
        await access(READY_MARKER, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(text);
}
/** Run a command and collect output; resolves true on exit code 0. */
function run(cmd, args, timeoutMs = 600_000) {
    return new Promise((resolveBody) => {
        const child = spawn(cmd, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
        child.on('close', (code) => {
            clearTimeout(timer);
            resolveBody({ ok: code === 0, stderr: stderr.trim().slice(-500) });
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            resolveBody({ ok: false, stderr: String(error) });
        });
    });
}
/** The transcribe.py wrapper (writes plain transcript text to stdout). */
function transcribeScript() {
    return `import sys
try:
    from faster_whisper import WhisperModel
except Exception as e:
    print("faster_whisper not installed: %s" % e, file=sys.stderr)
    sys.exit(1)
audio = sys.argv[1]
model = WhisperModel(${JSON.stringify(LOCAL_ASR_MODEL)}, device="cpu", compute_type="int8")
segments, _ = model.transcribe(audio, language="zh", vad_filter=True, beam_size=5)
for seg in segments:
    t = seg.text.strip()
    if t:
        print(t)
`;
}
/** Run the full install; updates installState as it goes. */
async function performInstall() {
    installState = { phase: 'checking' };
    try {
        // 1) env check
        const py = await run('python3', ['--version']);
        if (!py.ok)
            throw new Error(`python3 不可用：${py.stderr || '未安装'}`);
        const ff = await run('ffmpeg', ['-version'], 10_000);
        if (!ff.ok)
            throw new Error('ffmpeg 不可用，请先安装 ffmpeg');
        await mkdir(ASR_DIR, { recursive: true });
        // 2) deps
        installState = { phase: 'installing-deps' };
        const pip = await run('pip3', ['install', '--break-system-packages', '-q', 'faster-whisper'], 600_000);
        if (!pip.ok)
            throw new Error(`faster-whisper 安装失败：${pip.stderr}`);
        // 3) model download (probe once so the model is cached)
        installState = { phase: 'downloading-model' };
        const probeCode = `from faster_whisper import WhisperModel; WhisperModel(${JSON.stringify(LOCAL_ASR_MODEL)}, device="cpu", compute_type="int8")`;
        const probe = await run('python3', ['-c', probeCode], 1_800_000);
        if (!probe.ok)
            throw new Error(`模型下载失败：${probe.stderr}`);
        // 4) write wrapper + marker
        installState = { phase: 'writing' };
        await writeFile(TRANSCRIBE_SCRIPT, transcribeScript(), 'utf8');
        await writeFile(READY_MARKER, `model=${LOCAL_ASR_MODEL}\n`, 'utf8');
        installState = { phase: 'done' };
    }
    catch (error) {
        installState = { phase: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
}
/** Register the ASR install routes. */
export function registerAsrInstallRoutes(ctx) {
    const webServer = ctx.get('webServer');
    webServer.register({
        kind: 'exact',
        path: '/api/looklook-asr-status',
        handler: async (_req, res) => {
            const installed = await localAsrReady();
            sendJson(res, 200, { installed, phase: installState.phase, model: LOCAL_ASR_MODEL, error: installState.error ?? null });
        },
    });
    webServer.register({
        kind: 'exact',
        path: '/api/looklook-asr-install',
        handler: async (req, res) => {
            if (req.method !== 'POST')
                return sendJson(res, 405, { ok: false, error: 'method not allowed' });
            // Idempotent: if already installed or installing, report current state.
            if (installState.phase === 'done' || (await localAsrReady())) {
                return sendJson(res, 200, { ok: true, already: true, phase: 'done' });
            }
            if (installState.phase !== 'none' && installState.phase !== 'failed') {
                return sendJson(res, 200, { ok: true, already: true, phase: installState.phase });
            }
            void performInstall();
            sendJson(res, 200, { ok: true, phase: 'checking' });
        },
    });
}
/** Read the ready marker (for tests). */
export async function readReadyMarker() {
    try {
        return await readFile(READY_MARKER, 'utf8');
    }
    catch {
        return undefined;
    }
}
