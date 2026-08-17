/**
 * Host receiver for the client's RPCs (`remote.looklook`):
 * - `listModels` — probe an OpenAI-compatible `/models` endpoint with the
 *   provider's stored credential, so the settings page can verify an API key
 *   and offer the model list without a separate "test connection" step;
 * - `upload` — save one dropped file into the session `.uploads/` (the
 *   "file channel": images never touch the native attachment pipeline, so
 *   api-proxy's model-modality check is never triggered);
 * - `asrStatus` / `asrInstall` — local ASR one-click install state/trigger;
 * - `sessionModality` — report whether the session's current model accepts
 *   image input, so the client can route a dropped image to the native
 *   pipeline (multi-modal model) or to the file channel (text-only model).
 *
 * All methods are Remote (Typert) calls, so they ride the authorized
 * api-proxy connection — no unauth'd HTTP routes are exposed.
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { saveUpload, MAX_UPLOAD_BYTES, safeFileName, UPLOADS_DIR } from "./upload.js";
import { localAsrReady, performInstall, readReadyMarker, installedAsrModel, currentInstallPhase, currentInstallError, ASR_MODEL_OPTIONS, } from "./asr-install.js";
import { runEnvCheck, repairEnv } from "./env-check.js";
import { chatCompletionsUrl } from "./vision-client.js";
/** A tiny 1×1 red PNG (78 bytes) used to probe whether a vision model can
 * actually accept image input. */
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
/** A 0.5 s silent 16 kHz mono WAV (44-byte header + silence) used to probe
 * whether an audio model can actually accept audio input. */
const TEST_AUDIO_BASE64 = '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';
const LOOKLOOK_SETTINGS_NAMESPACES = new Set(['looklook', 'vision', 'looklook-audio']);
const LOOKLOOK_CREDENTIAL_PREFIX = 'LOOKLOOK_';
/** Credential-bearing fetch: fail before following any redirect. */
const FETCH_REDIRECT = 'error';
/**
 * Host service answering `remote.looklook.*`. Extends
 * `TypertRemoteService` so the gateway's source-mode discovery sees the
 * binding (`ctx.looklookRemote` ← wire namespace `looklook`); the client
 * mounts the matching descriptor.
 */
let LooklookRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describeSettings_decorators;
    let _updateSettings_decorators;
    let _describeCredentials_decorators;
    let _setCredential_decorators;
    let _listModels_decorators;
    let _upload_decorators;
    let _asrStatus_decorators;
    let _asrInstall_decorators;
    let _sessionModality_decorators;
    let _readUpload_decorators;
    let _envCheck_decorators;
    let _envRepair_decorators;
    let _testVision_decorators;
    let _testAudio_decorators;
    return class LooklookRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describeSettings_decorators = [Remote];
            _updateSettings_decorators = [Remote];
            _describeCredentials_decorators = [Remote];
            _setCredential_decorators = [Remote];
            _listModels_decorators = [Remote];
            _upload_decorators = [Remote];
            _asrStatus_decorators = [Remote];
            _asrInstall_decorators = [Remote];
            _sessionModality_decorators = [Remote];
            _readUpload_decorators = [Remote];
            _envCheck_decorators = [Remote];
            _envRepair_decorators = [Remote];
            _testVision_decorators = [Remote];
            _testAudio_decorators = [Remote];
            __esDecorate(this, null, _describeSettings_decorators, { kind: "method", name: "describeSettings", static: false, private: false, access: { has: obj => "describeSettings" in obj, get: obj => obj.describeSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateSettings_decorators, { kind: "method", name: "updateSettings", static: false, private: false, access: { has: obj => "updateSettings" in obj, get: obj => obj.updateSettings }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _describeCredentials_decorators, { kind: "method", name: "describeCredentials", static: false, private: false, access: { has: obj => "describeCredentials" in obj, get: obj => obj.describeCredentials }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setCredential_decorators, { kind: "method", name: "setCredential", static: false, private: false, access: { has: obj => "setCredential" in obj, get: obj => obj.setCredential }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listModels_decorators, { kind: "method", name: "listModels", static: false, private: false, access: { has: obj => "listModels" in obj, get: obj => obj.listModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _upload_decorators, { kind: "method", name: "upload", static: false, private: false, access: { has: obj => "upload" in obj, get: obj => obj.upload }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _asrStatus_decorators, { kind: "method", name: "asrStatus", static: false, private: false, access: { has: obj => "asrStatus" in obj, get: obj => obj.asrStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _asrInstall_decorators, { kind: "method", name: "asrInstall", static: false, private: false, access: { has: obj => "asrInstall" in obj, get: obj => obj.asrInstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sessionModality_decorators, { kind: "method", name: "sessionModality", static: false, private: false, access: { has: obj => "sessionModality" in obj, get: obj => obj.sessionModality }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readUpload_decorators, { kind: "method", name: "readUpload", static: false, private: false, access: { has: obj => "readUpload" in obj, get: obj => obj.readUpload }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _envCheck_decorators, { kind: "method", name: "envCheck", static: false, private: false, access: { has: obj => "envCheck" in obj, get: obj => obj.envCheck }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _envRepair_decorators, { kind: "method", name: "envRepair", static: false, private: false, access: { has: obj => "envRepair" in obj, get: obj => obj.envRepair }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _testVision_decorators, { kind: "method", name: "testVision", static: false, private: false, access: { has: obj => "testVision" in obj, get: obj => obj.testVision }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _testAudio_decorators, { kind: "method", name: "testAudio", static: false, private: false, access: { has: obj => "testAudio" in obj, get: obj => obj.testAudio }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'looklookRemote', { namespace: 'looklook' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        /** Read the three plugin-owned settings namespaces without exposing them as
         * configurable LLM providers in the global model-provider picker. */
        async describeSettings() {
            try {
                const settings = this.ctx.get('settings');
                if (settings === undefined)
                    return { ok: false, error: '设置服务未就绪' };
                const namespaces = [...LOOKLOOK_SETTINGS_NAMESPACES].map(ns => ({
                    ns,
                    value: settings.get(settingsNamespace(ns)),
                }));
                return { ok: true, value: { namespaces } };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /** Update one plugin-owned settings namespace. */
        async updateSettings(payload) {
            try {
                if (!LOOKLOOK_SETTINGS_NAMESPACES.has(payload.ns))
                    return { ok: false, error: '不允许更新该设置命名空间' };
                const settings = this.ctx.get('settings');
                if (settings === undefined)
                    return { ok: false, error: '设置服务未就绪' };
                await settings.update(settingsNamespace(payload.ns), payload.patch);
                return { ok: true };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /** Describe plugin-owned API-key references without returning values. */
        async describeCredentials(refs) {
            try {
                const credentials = this.ctx.get('credentials');
                if (credentials === undefined)
                    return { ok: false, error: '凭据服务未就绪' };
                const result = {};
                for (const ref of refs) {
                    if (!ref.startsWith(LOOKLOOK_CREDENTIAL_PREFIX))
                        continue;
                    const info = await credentials.describe(credentialRef(ref));
                    result[ref] = { configured: info.configured, writable: info.writable };
                }
                return { ok: true, credentials: result };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /** Store one plugin-owned API key. The secret never returns over the wire. */
        async setCredential(payload) {
            try {
                if (!payload.ref.startsWith(LOOKLOOK_CREDENTIAL_PREFIX) || payload.value.length === 0) {
                    return { ok: false, error: '不允许写入该凭据引用' };
                }
                const credentials = this.ctx.get('credentials');
                if (credentials === undefined)
                    return { ok: false, error: '凭据服务未就绪' };
                await credentials.set(credentialRef(payload.ref), payload.value);
                return { ok: true };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /**
         * Probe one provider's `/models` endpoint. Uses the just-typed key when the
         * caller passes one (the settings editor has not saved yet); otherwise reads
         * the stored credential for the reference.
         * @param provider - the provider's endpoint, credential reference, and an
         *   optional just-typed key that takes precedence over storage.
         * @returns the model id list, or a classified failure.
         */
        async listModels(provider) {
            let key = provider.apiKey;
            if (key === undefined || key.length === 0) {
                const credentials = this.ctx.get('credentials');
                key = credentials === undefined
                    ? undefined
                    : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value;
            }
            if (key === undefined || key.length === 0) {
                return { ok: false, error: '请先填写 API Key' };
            }
            try {
                const url = `${provider.baseURL.trim().replace(/\/+$/, '')}/models`;
                const response = await fetch(url, {
                    redirect: FETCH_REDIRECT,
                    // Fresh per call: an AbortSignal.timeout starts ticking at creation.
                    signal: AbortSignal.timeout(10_000),
                    headers: { authorization: `Bearer ${key}` },
                });
                if (!response.ok) {
                    return { ok: false, error: `HTTP ${response.status}` };
                }
                const payload = await response.json();
                const models = (payload.data ?? [])
                    .map(item => item.id)
                    .filter((id) => typeof id === 'string');
                return { ok: true, models };
            }
            catch (error) {
                return {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
        /**
         * Save one dropped file into the session workspace `.uploads/`. Images,
         * archives, and videos all ride this channel; the returned path is what the
         * model sees. Authorized by the connection, size-capped, path-safe.
         */
        async upload(payload) {
            try {
                const result = await saveUpload(this.ctx, payload.sessionId, payload.name, payload.data);
                return { ok: true, ...result };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /** Report the local ASR install state (ready marker + in-memory phase). */
        async asrStatus() {
            const installed = await localAsrReady();
            const currentModel = await installedAsrModel();
            const memPhase = currentInstallPhase();
            const isActive = memPhase === 'checking' || memPhase === 'installing-deps'
                || memPhase === 'downloading-model' || memPhase === 'writing';
            return {
                // While an install is actively running (incl. a SWAP), the old ready
                // marker may still exist — do NOT report installed/done then, or the
                // client stops polling and misses the swap. installed is true only
                // when a marker exists AND nothing is running.
                installed: installed && !isActive,
                phase: isActive ? memPhase : (installed ? 'done' : memPhase),
                model: currentModel ?? '',
                options: ASR_MODEL_OPTIONS.map(({ id, name, sizeLabel }) => ({ id, name, sizeLabel })),
                error: currentInstallError(),
            };
        }
        /**
         * Trigger the local ASR install for one model (idempotent per model). The
         * model is EXCLUSIVE: installing a new size purges the previous one.
         * Returns the current phase after starting or acknowledging; the client
         * polls asrStatus for progress.
         */
        async asrInstall(payload) {
            try {
                const model = payload?.model ?? undefined;
                const outcome = await startInstallIfNeeded(model);
                return { ok: true, ...outcome };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /**
         * Report whether the session's current model accepts image input, by
         * resolving the session's last request header route. Used by the client to
         * decide between the native image pipeline and the file channel.
         */
        async sessionModality(sessionId) {
            try {
                const sessions = this.ctx.get('sessions');
                if (sessions === undefined)
                    return { ok: false, error: 'sessions 服务不可用' };
                const session = sessions.get(sessionId);
                if (session === undefined)
                    return { ok: false, error: 'session not found' };
                const header = session.requestHeader();
                const provider = header?.config?.provider;
                const model = header?.config?.model;
                if (provider === undefined || model === undefined)
                    return { ok: false, error: '会话尚未建立模型路由' };
                const info = await this.ctx.llm.resolveModelInfo(provider, model);
                // Undefined inputModalities = endpoint does not declare modality; the
                // native api-proxy treats it as image-capable (its refusal only fires
                // when explicitly declared without image), so mirror that here.
                return { ok: true, supportsImage: info.inputModalities === undefined || info.inputModalities.includes('image') };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /**
         * Read one uploaded file's bytes back from the session `.uploads/` (the
         * client renders thumbnails / lightbox for image files through this RPC).
         * Restricted: basename only, must exist under `.uploads/`, image types
         * only, size-capped — a read-only file channel, no arbitrary paths.
         */
        async readUpload(payload) {
            try {
                const sessions = this.ctx.get('sessions');
                if (sessions === undefined)
                    return { ok: false, error: 'sessions 服务不可用' };
                const session = sessions.get(payload.sessionId);
                const cwd = session?.header.cwd;
                if (cwd === undefined)
                    return { ok: false, error: 'session not found or has no workspace' };
                const uploadDir = join(cwd, UPLOADS_DIR);
                const name = safeFileName(payload.name);
                const target = resolve(uploadDir, name);
                // Guards: target must be strictly inside uploadDir (basename-only names
                // already rule out traversal; this is defense in depth).
                const resolvedUploadDir = resolve(uploadDir);
                if (target !== resolvedUploadDir && !target.startsWith(resolvedUploadDir + sep)) {
                    return { ok: false, error: 'invalid file target' };
                }
                // Stat first so an oversized image is rejected without loading it into
                // memory (the 100MB upload cap would otherwise create a transient spike).
                const { stat } = await import('node:fs/promises');
                const info = await stat(target);
                if (!info.isFile())
                    return { ok: false, error: 'not a file' };
                if (info.size > 32 * 1024 * 1024)
                    return { ok: false, error: '图片超过 32MB 上限' };
                const data = await readFile(target);
                const mediaType = mediaTypeOfUpload(name);
                if (mediaType === undefined)
                    return { ok: false, error: 'not an image file' };
                return { ok: true, mediaType, data: data.toString('base64') };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /** Run the full environment self-check for the settings dialog. */
        async envCheck() {
            try {
                return await runEnvCheck();
            }
            catch (error) {
                return {
                    ok: false,
                    summary: '环境检测失败',
                    items: [{
                            id: 'check',
                            label: '环境检测',
                            status: 'error',
                            detail: error instanceof Error ? error.message : String(error),
                            repairable: false,
                        }],
                };
            }
        }
        /** One-click repair for one env item; returns the item's fresh state. */
        async envRepair(action) {
            try {
                return await repairEnv(action);
            }
            catch (error) {
                return {
                    id: 'repair',
                    label: '一键修复',
                    status: 'error',
                    detail: error instanceof Error ? error.message : String(error),
                    repairable: false,
                };
            }
        }
        /**
         * Probe whether one vision provider actually accepts image input, by
         * sending a tiny built-in test image through chat/completions. A 2xx with
         * a non-empty answer means the model can see images; 400/415/422 mean the
         * endpoint rejects image input.
         */
        async testVision(provider) {
            let key = provider.apiKey;
            if (key === undefined || key.length === 0) {
                const credentials = this.ctx.get('credentials');
                key = credentials === undefined
                    ? undefined
                    : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value;
            }
            if (key === undefined || key.length === 0)
                return { ok: false, error: '请先填写 API Key' };
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(new Error('timeout')), 30_000);
                try {
                    const response = await fetch(chatCompletionsUrl(provider.baseURL), {
                        method: 'POST',
                        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
                        redirect: 'error',
                        signal: controller.signal,
                        body: JSON.stringify({
                            model: provider.model,
                            messages: [{
                                    role: 'user',
                                    content: [
                                        { type: 'text', text: '这是一张测试图片。请只回复"OK"两个字。' },
                                        { type: 'image_url', image_url: { url: `data:image/png;base64,${TEST_IMAGE_BASE64}` } },
                                    ],
                                }],
                            max_tokens: 20,
                        }),
                    });
                    if (response.status === 400 || response.status === 415 || response.status === 422) {
                        return { ok: true, supportsImage: false, message: '该模型拒绝图像输入（可能仅支持文本）。若模型名/接口正确，换一个支持图片的视觉模型即可。' };
                    }
                    if (response.status === 401 || response.status === 403) {
                        return { ok: false, error: `API Key 鉴权失败（HTTP ${response.status}），请检查 API Key` };
                    }
                    if (response.status === 404) {
                        return { ok: false, error: '模型不存在（HTTP 404），请检查模型名' };
                    }
                    if (!response.ok)
                        return { ok: false, error: `测试请求失败（HTTP ${response.status}）` };
                    const body = await response.json();
                    const message = body.choices?.[0]?.message;
                    let text = '';
                    for (const field of ['content', 'reasoning']) {
                        const value = message?.[field];
                        if (typeof value === 'string' && value.trim() !== '') {
                            text = value.trim();
                            break;
                        }
                    }
                    if (text === '')
                        return { ok: true, supportsImage: false, message: '模型返回了空内容，可能不支持图像输入' };
                    return { ok: true, supportsImage: true, message: '模型可以看图 ✓（测试回复：' + text.slice(0, 40) + '）' };
                }
                finally {
                    clearTimeout(timeout);
                }
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
        /**
         * Probe one audio provider's capability level:
         * - L2: chat/completions + input_audio works (transcript + tone/music/pace);
         * - L1: only /v1/audio/transcriptions works (transcript only);
         * - none: neither route accepts the test audio.
         */
        async testAudio(provider) {
            let key = provider.apiKey;
            if (key === undefined || key.length === 0) {
                const credentials = this.ctx.get('credentials');
                key = credentials === undefined
                    ? undefined
                    : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value;
            }
            if (key === undefined || key.length === 0)
                return { ok: false, error: '请先填写 API Key' };
            try {
                // Try L2 first (higher capability).
                const l2 = await probeAudioL2(provider, key);
                if (l2.accepted)
                    return { ok: true, level: 'L2', message: '支持 L2：对白 + 语气/音乐/节奏（完整音频理解）✓' };
                // Then L1.
                const l1 = await probeAudioL1(provider, key);
                if (l1.accepted)
                    return { ok: true, level: 'L1', message: '支持 L1：仅对白转写（纯 transcript，无语气/音乐分析）' };
                return {
                    ok: true,
                    level: 'none',
                    message: `音频输入不可用。L2 失败：${l2.error}；L1 失败：${l1.error}`,
                };
            }
            catch (error) {
                return { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
        }
    };
})();
export { LooklookRemoteService };
/** Map an upload file name to an image media type (or undefined). */
function mediaTypeOfUpload(name) {
    const dot = name.toLowerCase().lastIndexOf('.');
    const ext = dot >= 0 ? name.toLowerCase().slice(dot) : '';
    switch (ext) {
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.gif': return 'image/gif';
        case '.bmp': return 'image/bmp';
        case '.avif': return 'image/avif';
        default: return undefined;
    }
}
// ── ASR install trigger (single installer at a time; state lives in asr-install.ts) ──
/** Start the install for one model; returns (phase, already).
 * Rules:
 * - already done with the SAME model → already:true;
 * - already done with a DIFFERENT model → swap (purge old, install new);
 * - a mid-phase install is refused (single installer at a time);
 * - otherwise start a fresh install. */
async function startInstallIfNeeded(model) {
    const currentModel = await installedAsrModel();
    const ready = await localAsrReady();
    // Same model already installed.
    if (ready && (model === undefined || model === currentModel)) {
        return { phase: 'done', already: true };
    }
    // Already installed but the user asked for a DIFFERENT size → swap.
    if (ready && model !== undefined && model !== currentModel) {
        void performInstall(model);
        return { phase: 'checking', already: false };
    }
    // A mid-phase install is running → refuse.
    if (currentInstallPhase() !== 'none' && currentInstallPhase() !== 'failed') {
        return { phase: currentInstallPhase(), already: true };
    }
    void performInstall(model);
    return { phase: 'checking', already: false };
}
// ── Audio capability probes (used by testAudio) ──
/** L2 probe: chat/completions + input_audio. */
async function probeAudioL2(provider, apiKey) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('timeout')), 30_000);
        try {
            const response = await fetch(chatCompletionsUrl(provider.baseURL), {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
                redirect: 'error',
                signal: controller.signal,
                body: JSON.stringify({
                    model: provider.model,
                    messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: '这是一段测试音频。请只回复"OK"两个字。' },
                                { type: 'input_audio', input_audio: { data: TEST_AUDIO_BASE64, format: 'wav' } },
                            ],
                        }],
                    max_tokens: 20,
                }),
            });
            if (response.status === 400 || response.status === 415 || response.status === 422) {
                return { accepted: false, error: `HTTP ${response.status}（拒绝音频输入）` };
            }
            if (response.status === 401 || response.status === 403) {
                return { accepted: false, error: `鉴权失败 HTTP ${response.status}` };
            }
            if (response.status === 404)
                return { accepted: false, error: '模型不存在（404）' };
            if (!response.ok)
                return { accepted: false, error: `HTTP ${response.status}` };
            return { accepted: true, error: '' };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/** L1 probe: /v1/audio/transcriptions. */
async function probeAudioL1(provider, apiKey) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('timeout')), 30_000);
        try {
            const form = new FormData();
            form.append('file', new Blob([Buffer.from(TEST_AUDIO_BASE64, 'base64')], { type: 'audio/wav' }), 'test.wav');
            form.append('model', provider.model);
            const base = provider.baseURL.trim().replace(/\/+$/, '');
            const url = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { authorization: `Bearer ${apiKey}` },
                redirect: 'error',
                signal: controller.signal,
                body: form,
            });
            if (response.status === 400 || response.status === 415 || response.status === 422) {
                return { accepted: false, error: `HTTP ${response.status}（拒绝转写）` };
            }
            if (response.status === 401 || response.status === 403) {
                return { accepted: false, error: `鉴权失败 HTTP ${response.status}` };
            }
            if (!response.ok)
                return { accepted: false, error: `HTTP ${response.status}` };
            return { accepted: true, error: '' };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
}
export { MAX_UPLOAD_BYTES, readReadyMarker };
