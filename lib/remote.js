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
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { saveUpload, MAX_UPLOAD_BYTES, safeFileName, UPLOADS_DIR } from "./upload.js";
import { localAsrReady, performInstall, readReadyMarker, currentInstallPhase, currentInstallError, LOCAL_ASR_MODEL, } from "./asr-install.js";
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
    let _listModels_decorators;
    let _upload_decorators;
    let _asrStatus_decorators;
    let _asrInstall_decorators;
    let _sessionModality_decorators;
    let _readUpload_decorators;
    return class LooklookRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listModels_decorators = [Remote];
            _upload_decorators = [Remote];
            _asrStatus_decorators = [Remote];
            _asrInstall_decorators = [Remote];
            _sessionModality_decorators = [Remote];
            _readUpload_decorators = [Remote];
            __esDecorate(this, null, _listModels_decorators, { kind: "method", name: "listModels", static: false, private: false, access: { has: obj => "listModels" in obj, get: obj => obj.listModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _upload_decorators, { kind: "method", name: "upload", static: false, private: false, access: { has: obj => "upload" in obj, get: obj => obj.upload }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _asrStatus_decorators, { kind: "method", name: "asrStatus", static: false, private: false, access: { has: obj => "asrStatus" in obj, get: obj => obj.asrStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _asrInstall_decorators, { kind: "method", name: "asrInstall", static: false, private: false, access: { has: obj => "asrInstall" in obj, get: obj => obj.asrInstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _sessionModality_decorators, { kind: "method", name: "sessionModality", static: false, private: false, access: { has: obj => "sessionModality" in obj, get: obj => obj.sessionModality }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readUpload_decorators, { kind: "method", name: "readUpload", static: false, private: false, access: { has: obj => "readUpload" in obj, get: obj => obj.readUpload }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'looklookRemote', { namespace: 'looklook' });
            __runInitializers(this, _instanceExtraInitializers);
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
            return {
                installed,
                phase: installed ? 'done' : currentInstallPhase(),
                model: LOCAL_ASR_MODEL,
                error: currentInstallError(),
            };
        }
        /**
         * Trigger the local ASR install (idempotent). Returns the current phase
         * after starting or acknowledging; the client polls asrStatus for progress.
         */
        async asrInstall() {
            try {
                const outcome = await startInstallIfNeeded();
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
/** Start the install if not already running; returns (phase, already). */
async function startInstallIfNeeded() {
    if (currentInstallPhase() === 'done' || (await localAsrReady())) {
        return { phase: 'done', already: true };
    }
    if (currentInstallPhase() !== 'none' && currentInstallPhase() !== 'failed') {
        return { phase: currentInstallPhase(), already: true };
    }
    void performInstall();
    return { phase: 'checking', already: false };
}
export { MAX_UPLOAD_BYTES, readReadyMarker };
