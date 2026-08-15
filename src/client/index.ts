/**
 * dsh-looklook client face: the "Look Look 功能" master-switch settings
 * section, the (conditionally visible) "视觉模型" settings section, the
 * per-session eye toggle, and the composer "上传文件" control.
 *
 * All settings go through the existing wire settings API (no new RPCs); the
 * host face (src/index.ts) consumes the same namespaces at request time.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only: pulls the shell's SlotMap merges (settings.section,
// conversation.input.left) and the locale/remote Context merges.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createEyeController, type EyeController } from './eye-controller.ts'
import { createFeatureController, type FeatureController } from './feature-controller.ts'
import { LooklookUserMessageNodeView } from './UserMessageNodeView.tsx'
import { LooklookFeaturesSection, type FeaturesInjected } from './Features.tsx'
import { VisionSettingsSection, type VisionSettingsInjected } from './VisionSettings.tsx'
import { VisionToggle, type VisionToggleInjected } from './VisionToggle.tsx'
import { UploadButton, type UploadInjected } from './UploadButton.tsx'
import { en, zh, type LookLookKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-looklook copy (settings page + eye toggle + upload). */
    looklook: LookLookKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'looklook'

/** Settings section ids and slot entry ids. */
const FEATURES_ID = 'looklook'
const VISION_ID = 'looklook-vision'
const TOGGLE_ID = 'looklook-eye'
const UPLOAD_ID = 'looklook-upload'

/** Required services: slots (registration), locale (copy), connection (wire API), remote (pushed invalidations), sessions (per-session scoping). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'sessions']

/**
 * Client plugin body: register the master-switch settings section, the
 * (multimodal-gated) vision settings section, the composer eye toggle, and
 * the composer upload control.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-looklook: dictionaries')
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle

  const eyes = new Map<string, EyeController>()
  const eyeFor = (sessionId: string): EyeController => {
    let controller = eyes.get(sessionId)
    if (controller === undefined) {
      controller = createEyeController(connection.api, sessionId)
      controller.load()
      eyes.set(sessionId, controller)
    }
    return controller
  }

  // Feature master switches (multimodal / zip).
  const features: FeatureController = createFeatureController(connection.api)
  features.load()
  const useFeaturesSnapshot = bindSnapshotSelector(features.store)
  const useMultimodal = (): boolean => useFeaturesSnapshot(
    (s: { status: string; multimodal?: boolean }) => s.status === 'ready' && s.multimodal !== false,
  ) as boolean
  const useZipEnabled = (): boolean => useFeaturesSnapshot(
    (s: { status: string; zip?: boolean }) => s.status === 'ready' && s.zip !== false,
  ) as boolean

  // Pushed invalidations refresh loaded controllers without polling.
  ctx.effect(() => {
    const dispose = ctx.remote.$on('settings/document-updated', () => {
      for (const controller of eyes.values()) controller.load()
      features.load()
    })
    return () => { dispose() }
  }, 'dsh-looklook: settings invalidation fan-out')

  /** Strict wire schema for the discovery request (Typert requires strict codecs). */
  const parseProvider = (value: unknown): { baseURL: string; apiKeyEnv: string; apiKey?: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('provider must be an object')
    const record = value as Record<string, unknown>
    if (typeof record.baseURL !== 'string' || typeof record.apiKeyEnv !== 'string') {
      throw new Error('provider requires baseURL and apiKeyEnv strings')
    }
    return {
      baseURL: record.baseURL,
      apiKeyEnv: record.apiKeyEnv,
      ...typeof record.apiKey === 'string' ? { apiKey: record.apiKey } : {},
    }
  }

  /** Strict wire schema for the discovery result. */
  const parseResult = (value: unknown): { ok: true; models: string[] } | { ok: false; error: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('result must be an object')
    const record = value as Record<string, unknown>
    if (record.ok === true && Array.isArray(record.models)
      && record.models.every(item => typeof item === 'string')) {
      return { ok: true, models: record.models as string[] }
    }
    if (record.ok === false && typeof record.error === 'string') {
      return { ok: false, error: record.error }
    }
    throw new Error('result must be { ok: true, models } or { ok: false, error }')
  }

  // Model-discovery RPC: mount the `remote.looklook` namespace backed by the
  // host LooklookRemoteService, so the settings page can probe `/models`.
  ctx.effect(() => {
    const mounting = ctx.remote.$mount({
      package: 'dsh-looklook',
      descriptors: [{
        id: 'looklook.listModels',
        service: 'looklookRemote',
        namespace: 'looklook',
        method: 'listModels',
        invocation: { kind: 'direct' },
        parameters: [{
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'VisionProviderProbe', schema: { parse: parseProvider } },
        }],
        result: { mode: 'strict', typeSymbol: 'LooklookListModelsResult', schema: { parse: parseResult } },
      }],
    })
    return () => { void mounting.then(dispose => dispose()) }
  }, 'dsh-looklook: model-discovery remote')

  /** Call the host discovery RPC once the namespace is mounted. */
  const listModels = async (provider: {
    baseURL: string
    apiKeyEnv: string
    apiKey?: string
  }): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> => {
    const remote = ctx.get('remote.looklook') as {
      listModels?: (p: {
        baseURL: string
        apiKeyEnv: string
        apiKey?: string
      }) => Promise<{ ok: boolean; value?: { ok: boolean; models?: string[]; error?: string }; error?: { message?: string } }>
    } | undefined
    if (remote?.listModels === undefined) return { ok: false, error: '模型服务未就绪' }
    const envelope = await remote.listModels(provider)
    if (!envelope.ok) {
      return {
        ok: false,
        error: typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '模型服务请求失败',
      }
    }
    const business = envelope.value
    if (business?.ok === true) {
      return { ok: true, models: business.models ?? [] }
    }
    return {
      ok: false,
      error: typeof business?.error === 'string' ? business.error : '获取模型失败',
    }
  }

  // Master-switch settings section (feature toggles + 7z install support).
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: FEATURES_ID,
    order: 11,
    label: () => t('features.nav'),
    inject: (): FeaturesInjected => ({ api: connection.api, t, features }),
  }, LooklookFeaturesSection))

  // Vision-model settings section, visible only while multimodal is ON.
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: VISION_ID,
    order: 12,
    label: () => t('settings.nav'),
    inject: (): VisionSettingsInjected => ({ api: connection.api, t, listModels, useMultimodal }),
  }, VisionSettingsSection))

  // Composer upload control (archives + video), gated by the zip toggle.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: UPLOAD_ID,
    inject: (sessionId: string): UploadInjected => ({ api: connection.api, t, useZipEnabled, sessionId }),
  }, UploadButton))

  // Per-session eye toggle.
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right',
    id: TOGGLE_ID,
    inject: (sessionId: string): VisionToggleInjected => {
      const controller = eyeFor(sessionId)
      return {
        controller,
        useSnapshot: bindSnapshotSelector(controller.store),
        t,
      }
    },
  }, VisionToggle))

  // Render the ORIGINAL image in user messages: the host embeds an attachment
  // marker in the recognition text (rc.6 record), and this view scans for it,
  // loads the image via the conversation's loadImage, and draws it above the
  // text. Priority -1 shadows the built-in user bubble.
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'user',
    priority: -1,
    locale: NS,
  }, LooklookUserMessageNodeView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'steering',
    priority: -1,
    locale: NS,
  }, LooklookUserMessageNodeView))
}
