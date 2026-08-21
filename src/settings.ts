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

import Schema from '@deepseek-ai/schemastery'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'

// ── Plugin master switch ──

/**
 * Plugin-level master switch. One switch controls the whole plugin:
 * - ON (default): every capability is enabled — image/video/file recognition
 *   through the file channel, the looklook_see tool, upload channel.
 * - OFF: the plugin is NOT uninstalled but is dormant — nothing is
 *   intercepted, the see tool answers "已关闭", and DSH behaves exactly as
 *   if the plugin were absent.
 *
 * Rationale: this plugin exists to give TEXT-ONLY models vision/audio. A
 * user whose model is already multi-modal does not need it at all, so there
 * is no point in per-feature toggles (识别图像 / 识别视频) — either the
 * plugin helps (ON) or the harness is left pristine (OFF).
 */
export interface LooklookSettings {
  /** Master switch: OFF = plugin dormant, DSH behaves as without it. */
  enabled: boolean
}

export const LooklookConfig: Schema<LooklookSettings> = Schema.object({
  enabled: Schema.boolean().default(true),
})

/** The settings owner handle for the master switch. */
export type LooklookScope = SettingsScope<LooklookSettings>

/** Resolve the live master switch (missing value defaults to enabled). */
export function looklookEnabled(scope: LooklookScope): boolean {
  return scope.get().enabled !== false
}

// ── Vision model (image / video-frame recognition) ──

/** One vision provider (an OpenAI-compatible chat-completions endpoint). */
export interface VisionProviderConfig {
  /** Stable unique id for this provider entry. */
  id: string
  /** Display name shown in settings and in recognition results. */
  name: string
  /** OpenAI-compatible base URL; `/chat/completions` is appended when absent. */
  baseURL: string
  /** Credential reference (environment-variable style) holding the API key. */
  apiKeyEnv: string
  /** Vision model id accepted by the endpoint. */
  model: string
  /** Per-request timeout budget in milliseconds. */
  timeoutMs?: number
  /** Whether this provider participates in recognition. */
  enabled?: boolean
}

/** Resolved vision configuration. */
export interface VisionSettings {
  /** Ordered provider list; the first enabled entry is primary, the rest are fallbacks. */
  providers: VisionProviderConfig[]
  /** Per-session eye state; an absent session defaults to `on`. */
  sessionOverrides: Record<string, 'on' | 'off'>
  /** Upper bound on one description's characters. */
  maxDescribeChars: number
}

export const Config: Schema<VisionSettings> = Schema.object({
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
})

/** The settings owner handle: merged value + live updates. */
export type VisionScope = SettingsScope<VisionSettings>

// ── Audio model (transcript + sound understanding, L2+L3 merged) ──

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
  id: string
  /** Display name shown in settings. */
  name: string
  /** OpenAI-compatible base URL. */
  baseURL: string
  /** Credential reference (environment-variable style) holding the API key. */
  apiKeyEnv: string
  /** Model id accepted by the endpoint. */
  model: string
  /** Per-request timeout budget in milliseconds. */
  timeoutMs?: number
  /** Whether this provider participates. */
  enabled?: boolean
}

/** Audio settings: API providers. */
export interface AudioSettings {
  /** API audio provider(s); the first enabled is primary, the rest are fallbacks. */
  providers: AudioProviderConfig[]
}

export const AudioConfig: Schema<AudioSettings> = Schema.object({
  providers: Schema.array(Schema.object({
    id: Schema.string().required(),
    name: Schema.string().required(),
    baseURL: Schema.string().required(),
    apiKeyEnv: Schema.string().required().role('credential-ref'),
    model: Schema.string().required(),
    timeoutMs: Schema.number().min(1000).max(600000).default(30_000),
    enabled: Schema.boolean().default(true),
  })).default([]),
})

/** The audio settings owner handle. */
export type AudioScope = SettingsScope<AudioSettings>

/** The enabled audio providers in failover order. */
export function enabledAudioProviders(scope: AudioScope): AudioProviderConfig[] {
  return scope.get().providers.filter(provider => provider.enabled !== false)
}

// ── Shared helpers ──

/** Resolve the effective eye state for one session (defaults to on). */
export function eyeStateFor(scope: VisionScope, sessionId: string | undefined): 'on' | 'off' {
  if (sessionId === undefined) return 'on'
  return scope.get().sessionOverrides[sessionId] ?? 'on'
}

/** The enabled providers in failover order; empty when none is configured. */
export function enabledProviders(scope: VisionScope): VisionProviderConfig[] {
  return scope.get().providers.filter(provider => provider.enabled !== false)
}
