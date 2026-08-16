/**
 * Vision settings: provider list (primary first, then fallbacks in order) and
 * the per-session eye-toggle overrides. The plugin registers this namespace on
 * the settings service; the composition row's `config` is the base layer, the
 * user document overrides it, and `scope.get()` reflects the merged value live.
 */

import Schema from '@deepseek-ai/schemastery'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'

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

// ── Feature toggles (the plugin master switches) ──

/** Plugin-level feature switches shown in the settings page. */
export interface LooklookSettings {
  /** Master switch for the vision (multi-modal) feature. */
  multimodal: boolean
  /** Whether the upload channel accepts the extended extension set. */
  moreExtensions: boolean
}

export const LooklookConfig: Schema<LooklookSettings> = Schema.object({
  multimodal: Schema.boolean().default(true),
  moreExtensions: Schema.boolean().default(true),
})

/** The settings owner handle for the feature toggles. */
export type LooklookScope = SettingsScope<LooklookSettings>

/** Resolve the live feature switches. */
export function looklookFeatures(scope: LooklookScope): LooklookSettings {
  const value = scope.get()
  return {
    multimodal: value.multimodal !== false,
    moreExtensions: value.moreExtensions !== false,
  }
}

/** Resolve the effective eye state for one session (defaults to on). */
export function eyeStateFor(scope: VisionScope, sessionId: string | undefined): 'on' | 'off' {
  if (sessionId === undefined) return 'on'
  return scope.get().sessionOverrides[sessionId] ?? 'on'
}

/** The enabled providers in failover order; empty when none is configured. */
export function enabledProviders(scope: VisionScope): VisionProviderConfig[] {
  return scope.get().providers.filter(provider => provider.enabled !== false)
}
