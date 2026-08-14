/**
 * Host receiver for the client's model-discovery RPC (`remote.looklook`).
 * `listModels` probes an OpenAI-compatible `/models` endpoint with the
 * provider's stored credential, so the settings page can verify an API key
 * and offer the model list without a separate "test connection" step.
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
/** Credential-bearing fetch: fail before following any redirect. */
const FETCH_OPTIONS = {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
};
/**
 * Host service answering `remote.looklook.listModels`. Extends
 * `TypertRemoteService` so the gateway's source-mode discovery sees the
 * binding (`ctx.looklookRemote` ← wire namespace `looklook`); the client
 * mounts the matching descriptor.
 */
let LooklookRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _listModels_decorators;
    return class LooklookRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listModels_decorators = [Remote];
            __esDecorate(this, null, _listModels_decorators, { kind: "method", name: "listModels", static: false, private: false, access: { has: obj => "listModels" in obj, get: obj => obj.listModels }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        constructor(ctx) {
            super(ctx, 'looklookRemote', { namespace: 'looklook' });
            __runInitializers(this, _instanceExtraInitializers);
        }
        /**
         * Probe one provider's `/models` endpoint with its stored API key.
         * @param provider - the provider's endpoint and credential reference.
         * @returns the model id list, or a classified failure.
         */
        async listModels(provider) {
            const credentials = this.ctx.get('credentials');
            const key = credentials === undefined
                ? undefined
                : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value;
            if (key === undefined) {
                return { ok: false, error: 'API Key 未配置' };
            }
            try {
                const url = `${provider.baseURL.trim().replace(/\/+$/, '')}/models`;
                const response = await fetch(url, {
                    ...FETCH_OPTIONS,
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
    };
})();
export { LooklookRemoteService };
