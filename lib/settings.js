/**
 * dsh-looklook settings: the plugin master switch and model configurations.
 *
 * One OpenAI-compatible vision model slot drives image/video-frame
 * recognition; one audio slot drives transcript + sound understanding
 * (L2+L3 merged — the plugin probes the model's capability automatically).
 *
 * The master switch (`looklook.enabled`):
 * - ON (default): every capability works.
 * - OFF: plugin dormant, DSH behaves as without it (not uninstalled).
 *
 * 上传扩展名无开关：装上插件即支持全部扩展名上传
 */
import Schema from '@deepseek-ai/schemastery';
export const LooklookConfig = Schema.object({
    enabled: Schema.boolean().default(true),
});
/** Resolve the live master switch (missing value defaults to enabled). */
export function looklookEnabled(scope) {
    return scope.get().enabled !== false;
}
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
export const AudioConfig = Schema.object({
    providers: Schema.array(Schema.object({
        id: Schema.string().required(),
        name: Schema.string().required(),
        baseURL: Schema.string().required(),
        apiKeyEnv: Schema.string().required().role('credential-ref'),
        model: Schema.string().required(),
        timeoutMs: Schema.number().min(1000).max(600000).default(30_000),
        enabled: Schema.boolean().default(true),
    })).default([]),
});
/** The enabled audio providers in failover order. */
export function enabledAudioProviders(scope) {
    return scope.get().providers.filter(provider => provider.enabled !== false);
}
// ── Shared helpers ──
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
