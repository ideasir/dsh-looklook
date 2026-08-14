/**
 * dsh-looklook client face: the "视觉模型" settings section and the per-session
 * eye toggle in the composer tool row.
 *
 * The eye toggle reads/writes the `vision` settings namespace through the
 * existing wire settings API (no new RPCs); the host face (src/index.ts)
 * consumes the same namespace at request time.
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
import { VisionSettingsSection, type VisionSettingsInjected } from './VisionSettings.tsx'
import { VisionToggle, type VisionToggleInjected } from './VisionToggle.tsx'
import { en, zh, type LookLookKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-looklook copy (settings page + eye toggle). */
    looklook: LookLookKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'looklook'

/** Settings section id and the eye toggle's slot entry id. */
const SECTION_ID = 'looklook'
const TOGGLE_ID = 'looklook-eye'

/** Required services: slots (registration), locale (copy), connection (wire API), remote (pushed invalidations), sessions (per-session scoping). */
export const inject = ['slots', 'locale', 'connection', 'remote', 'sessions']

/**
 * Client plugin body: register the settings section and the composer eye
 * toggle. Each session gets its own eye controller (lazy map); pushed
 * settings invalidations refresh every loaded controller.
 * @param ctx - client root context.
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

  // Pushed invalidations refresh loaded eye states without polling.
  ctx.effect(() => {
    const dispose = ctx.remote.$on('settings/document-updated', () => {
      for (const controller of eyes.values()) controller.load()
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
      }) => Promise<{ ok: true; models: string[] } | { ok: false; error: string }>
    } | undefined
    if (remote?.listModels === undefined) return { ok: false, error: '模型服务未就绪' }
    return remote.listModels(provider)
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: 12,
    label: () => t('settings.nav'),
    inject: (): VisionSettingsInjected => ({ api: connection.api, t, listModels }),
  }, VisionSettingsSection))

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
}
