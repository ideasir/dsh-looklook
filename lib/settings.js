/**
 * Vision settings: provider list (primary first, then fallbacks in order) and
 * the per-session eye-toggle overrides. The plugin registers this namespace on
 * the settings service; the composition row's `config` is the base layer, the
 * user document overrides it, and `scope.get()` reflects the merged value live.
 */
import Schema from '@deepseek-ai/schemastery';
export const Config = Schema.object({
    providers: Schema.array(Schema.object({
        id: Schema.string().required(),
        name: Schema.string().required(),
        baseURL: Schema.string().required(),
        apiKeyEnv: Schema.string().required().role('credential-ref'),
        model: Schema.string().required(),
        timeoutMs: Schema.number().min(1000).max(600000).default(30_000),
        enabled: Schema.boolean().default(true),
    })).default([]),
    sessionOverrides: Schema.dict(Schema.union(['on', 'off'])).default({}),
    maxDescribeChars: Schema.number().min(100).max(100_000).default(2000),
});
export const LooklookConfig = Schema.object({
    multimodal: Schema.boolean().default(true),
    zip: Schema.boolean().default(true),
});
/** Resolve the live feature switches. */
export function looklookFeatures(scope) {
    const value = scope.get();
    return {
        multimodal: value.multimodal !== false,
        zip: value.zip !== false,
    };
}
/** Resolve the effective eye state for one session (defaults to on). */
export function eyeStateFor(scope, sessionId) {
    if (sessionId === undefined)
        return 'on';
    return scope.get().sessionOverrides[sessionId] ?? 'on';
}
/** The enabled providers in failover order; empty when none is configured. */
export function enabledProviders(scope) {
    return scope.get().providers.filter(provider => provider.enabled !== false);
}
/** Whether any enabled vision provider is configured. */
export function hasConfiguredProvider(scope) {
    return enabledProviders(scope).length > 0;
}
