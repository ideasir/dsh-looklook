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
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
/** Plugin-level feature switches shown in the settings page. */
export interface LooklookSettings {
    /** Plugin image recognition: OFF = use the main model's own multimodal. */
    imageRecognition: boolean;
    /** Plugin video recognition: OFF = files saved only, never analyzed. */
    videoRecognition: boolean;
}
export declare const LooklookConfig: Schema<LooklookSettings>;
/** The settings owner handle for the feature toggles. */
export type LooklookScope = SettingsScope<LooklookSettings>;
/** Resolve the live feature switches. */
export declare function looklookFeatures(scope: LooklookScope): LooklookSettings;
/** One vision provider (an OpenAI-compatible chat-completions endpoint). */
export interface VisionProviderConfig {
    /** Stable unique id for this provider entry. */
    id: string;
    /** Display name shown in settings and in recognition results. */
    name: string;
    /** OpenAI-compatible base URL; `/chat/completions` is appended when absent. */
    baseURL: string;
    /** Credential reference (environment-variable style) holding the API key. */
    apiKeyEnv: string;
    /** Vision model id accepted by the endpoint. */
    model: string;
    /** Per-request timeout budget in milliseconds. */
    timeoutMs?: number;
    /** Whether this provider participates in recognition. */
    enabled?: boolean;
}
/** Resolved vision configuration. */
export interface VisionSettings {
    /** Ordered provider list; the first enabled entry is primary, the rest are fallbacks. */
    providers: VisionProviderConfig[];
    /** Per-session eye state; an absent session defaults to `on`. */
    sessionOverrides: Record<string, 'on' | 'off'>;
    /** Upper bound on one description's characters. */
    maxDescribeChars: number;
}
export declare const Config: Schema<VisionSettings>;
/** The settings owner handle: merged value + live updates. */
export type VisionScope = SettingsScope<VisionSettings>;
/**
 * One audio provider (an OpenAI-compatible endpoint). The plugin probes its
 * capability at use time and adapts automatically:
 * - chat/completions + input_audio works → full understanding
 *   (transcript + tone + music + pace in one call);
 * - only /v1/audio/transcriptions works → transcript-only fallback.
 * No capability label is required from the user.
 */
export interface AudioProviderConfig {
    /** Stable unique id for this provider entry. */
    id: string;
    /** Display name shown in settings. */
    name: string;
    /** OpenAI-compatible base URL. */
    baseURL: string;
    /** Credential reference (environment-variable style) holding the API key. */
    apiKeyEnv: string;
    /** Model id accepted by the endpoint. */
    model: string;
    /** Per-request timeout budget in milliseconds. */
    timeoutMs?: number;
    /** Whether this provider participates. */
    enabled?: boolean;
}
/** Audio settings: API providers only (local ASR install state is on disk). */
export interface AudioSettings {
    /** API audio provider(s); the first enabled is primary, the rest are fallbacks. */
    providers: AudioProviderConfig[];
}
export declare const AudioConfig: Schema<AudioSettings>;
/** The audio settings owner handle. */
export type AudioScope = SettingsScope<AudioSettings>;
/** The enabled audio providers in failover order. */
export declare function enabledAudioProviders(scope: AudioScope): AudioProviderConfig[];
/** Resolve the effective eye state for one session (defaults to on). */
export declare function eyeStateFor(scope: VisionScope, sessionId: string | undefined): 'on' | 'off';
/** The enabled providers in failover order; empty when none is configured. */
export declare function enabledProviders(scope: VisionScope): VisionProviderConfig[];
