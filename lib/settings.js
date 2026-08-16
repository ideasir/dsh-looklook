/**
 * dsh-looklook settings: model configurations and feature switches.
 *
 * Three OpenAI-compatible model slots drive every "look" capability:
 * - vision: 识别图像/视频画面（视频识别 = 抽帧成图，共用此模型）
 * - audio:  音频理解——对白转写 + 声音理解（L2+L3 合并为一个配置，
 *           插件按模型能力自动分级使用，无需用户标注能力等级）
 *
 * Feature switches:
 * - imageRecognition: 插件是否介入图像识别（OFF = 交给大模型自身多模态能力）
 * - videoRecognition: 插件是否介入视频识别（OFF = 仅保存文件，不分析）
 * - 上传扩展名无开关：装上插件即支持全部扩展名上传
 */
import Schema from '@deepseek-ai/schemastery';
export const LooklookConfig = Schema.object({
    imageRecognition: Schema.boolean().default(true),
    videoRecognition: Schema.boolean().default(true),
});
/** Resolve the live feature switches. */
export function looklookFeatures(scope) {
    const value = scope.get();
    return {
        imageRecognition: value.imageRecognition !== false,
        videoRecognition: value.videoRecognition !== false,
    };
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
