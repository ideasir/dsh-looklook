/**
 * dsh-looklook client face:
 * - the looklook entry inside the Plugins settings section (master switches +
 *   conditional vision-model config);
 * - drag-and-drop of archive/video files straight into the dialog;
 * - the per-session eye toggle and the original-image message view.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only: pulls the shell's SlotMap merges (settings.plugins.tab,
// conversation.input.left) and the locale/remote Context merges.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createEyeController, type EyeController } from './eye-controller.ts'
import { createFeatureController, type FeatureController } from './feature-controller.ts'
import { createPendingFilesController, type PendingFilesController } from './pending-files.ts'
import { LooklookUserMessageNodeView } from './UserMessageNodeView.tsx'
import { LooklookPluginCard, type LooklookCardInjected } from './PluginTab.tsx'
import { VisionToggle, type VisionToggleInjected } from './VisionToggle.tsx'
import { FileChips, type FileChipsInjected } from './FileChips.tsx'
import { isUploadableName, isNativeImageName, uploadFile, type SessionModality, type EnvCheckItem, type EnvCheckReport } from './upload-shared.ts'
import { en, zh, type LookLookKey } from './locales.ts'
import type { PluginSettingsClient } from './plugin-settings.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-looklook copy (settings page + eye toggle + upload). */
    looklook: LookLookKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'looklook'

/** Slot entry ids. */
const PLUGIN_CARD_ID = 'looklook'
const TOGGLE_ID = 'looklook-eye'
const PENDING_ID = 'looklook-pending'

/** Required services: slots, locale, connection, remote, sessions, conversation. */
export const inject = ['slots', 'locale', 'connection', 'remote', 'sessions', 'conversation']

/**
 * Client plugin body: register the looklook Plugins-settings tab, the
 * composer upload control, drag-and-drop of archive/video files, the eye
 * toggle, and the original-image message view.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-looklook: dictionaries')
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle
  const sessions = ctx.get('sessions') as {
    currentProvideInfo: { getSnapshot(): {
      sessionId?: string
      hooks?: Record<string, unknown>
      props?: Record<string, unknown>
    } | undefined; subscribe(fn: () => void): () => void }
    scope?(id: string): { get?(name: string): unknown } | undefined
  }

  // Pending staged files (uploaded, waiting for the user to press Enter).
  const pending: PendingFilesController = createPendingFilesController()
  const usePending = bindSnapshotSelector(pending.store)

  /** Compose the model-facing + client-rendering notes for one staged file. */
  const fileNote = (f: { name: string; path?: string; size: number }): string => {
    const path = f.path ?? ''
    const visible = t('upload.message', { name: f.name, path })
    const meta = JSON.stringify({ name: f.name, path, size: f.size })
    return `【looklook:开始】${visible}【looklook:结束】\n【looklook:file】${meta}【looklook:file】`
  }

  /**
   * Merge every staged file's note into the current draft. Returns the
   * merged draft text; the caller decides when to submit.
   */
  const mergeNotesIntoDraft = (sessionId: string, draft: string): string => {
    // Only fully-uploaded files (path set, no error) are merged; a file still
    // uploading OR failed stays in the chip row so the error stays visible.
    const staged = pending.get(sessionId).filter(
      f => f.path !== undefined && f.path !== '' && f.uploading !== true && f.error === undefined,
    )
    if (staged.length === 0) return draft
    const notes = staged.map(fileNote).join('\n')
    // Keep uploading/failed chips; drop only the merged (successful) ones.
    const remaining = pending.get(sessionId).filter(
      f => f.path === undefined || f.path === '' || f.uploading === true || f.error !== undefined,
    )
    const state = { ...pending.store.getSnapshot() }
    if (remaining.length > 0) state[sessionId] = remaining
    else delete state[sessionId]
    pending.store.set(state)
    return draft === '' ? notes : `${draft}\n${notes}`
  }

  /**
   * Enter/send submit patch (per-session): every submit route — Enter via the
   * keyboard, the send button via actions.submit — funnels through the
   * session input shell's `submit()`. Wrap it once so staged files ride the
   * outgoing message instead of needing a separate "send attachment" button.
   */
  const patchedSessions = new Set<string>()
  const ensureSubmitPatched = (sessionId: string): void => {
    if (patchedSessions.has(sessionId)) return
    const actx = sessions.scope ? sessions.scope(sessionId) : undefined
    if (actx === undefined) return
    const conversation = actx.get?.('conversation') as {
      input?: { for?: (scope: unknown) => unknown }
    } | undefined
    const shell = conversation?.input?.for?.(actx) as {
      setDraft?: (text: string) => void
      submit?: (mode?: string) => void
      state?: { getSnapshot(): { draft?: string } }
    } | undefined
    if (shell?.submit === undefined || shell?.setDraft === undefined || shell?.state === undefined) return
    const raw = shell as { __looklookWrapped?: boolean }
    if (raw.__looklookWrapped === true) {
      patchedSessions.add(sessionId)
      return
    }
    raw.__looklookWrapped = true
    const originalSubmit = shell.submit.bind(shell)
    const setDraft = shell.setDraft.bind(shell)
    const readDraft = (): string => shell.state?.getSnapshot()?.draft ?? ''
    shell.submit = (mode?: string) => {
      try {
        const draft = readDraft()
        const merged = mergeNotesIntoDraft(sessionId, draft)
        if (merged !== draft) setDraft(merged)
      } catch (error) {
        // Never let the merge break sending — the original submit must run.
        console.error('looklook submit merge failed:', error)
      }
      originalSubmit(mode)
    }
    patchedSessions.add(sessionId)
  }

  // Patch the current session's submit whenever the session changes, so the
  // merge is always in place before the user presses Enter.
  ctx.effect(() => {
    const sync = (): void => {
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId !== undefined && sessionId !== '') ensureSubmitPatched(sessionId)
    }
    const dispose = sessions.currentProvideInfo.subscribe(sync)
    sync()
    return () => { dispose() }
  }, 'dsh-looklook: submit merge patch')

  const pluginSettingsListeners = new Set<() => void>()
  const pluginSettings: PluginSettingsClient = {
    subscribe: (listener) => {
      pluginSettingsListeners.add(listener)
      return () => { pluginSettingsListeners.delete(listener) }
    },
    describe: async () => {
      const remote = ctx.get('remote.looklook') as { describeSettings?: () => Promise<{ ok: boolean; value?: { ok: boolean; value?: { namespaces?: Array<{ ns: string; value: unknown }> }; error?: string }; error?: { message?: string } }> } | undefined
      if (remote?.describeSettings === undefined) return { ok: false, error: '插件设置服务未就绪' }
      const envelope = await remote.describeSettings()
      const body = envelope.value
      if (!envelope.ok || body?.ok !== true) return { ok: false, error: typeof envelope.error === 'string' ? envelope.error : body?.error ?? '读取插件设置失败' }
      return { ok: true, namespaces: body.value?.namespaces ?? [] }
    },
    update: async (ns, patch) => {
      const remote = ctx.get('remote.looklook') as { updateSettings?: (payload: { ns: string; patch: Record<string, unknown> }) => Promise<{ ok: boolean; value?: { ok: boolean; error?: string }; error?: { message?: string } }> } | undefined
      if (remote?.updateSettings === undefined) return { ok: false, error: '插件设置服务未就绪' }
      const envelope = await remote.updateSettings({ ns, patch })
      const body = envelope.value
      if (!envelope.ok || body?.ok !== true) return { ok: false, error: typeof envelope.error === 'string' ? envelope.error : body?.error ?? '更新插件设置失败' }
      for (const listener of pluginSettingsListeners) listener()
      return { ok: true }
    },
    describeCredentials: async (refs) => {
      const remote = ctx.get('remote.looklook') as { describeCredentials?: (refs: string[]) => Promise<{ ok: boolean; value?: { ok: boolean; credentials?: Record<string, { configured: boolean; writable: boolean }>; error?: string }; error?: { message?: string } }> } | undefined
      if (remote?.describeCredentials === undefined) return { ok: false, error: '插件凭据服务未就绪' }
      const envelope = await remote.describeCredentials(refs)
      const body = envelope.value
      if (!envelope.ok || body?.ok !== true) return { ok: false, error: typeof envelope.error === 'string' ? envelope.error : body?.error ?? '读取插件凭据失败' }
      return { ok: true, credentials: body.credentials ?? {} }
    },
    setCredential: async (ref, value) => {
      const remote = ctx.get('remote.looklook') as { setCredential?: (payload: { ref: string; value: string }) => Promise<{ ok: boolean; value?: { ok: boolean; error?: string }; error?: { message?: string } }> } | undefined
      if (remote?.setCredential === undefined) return { ok: false, error: '插件凭据服务未就绪' }
      const envelope = await remote.setCredential({ ref, value })
      const body = envelope.value
      if (!envelope.ok || body?.ok !== true) return { ok: false, error: typeof envelope.error === 'string' ? envelope.error : body?.error ?? '保存插件凭据失败' }
      return { ok: true }
    },
  }

  const eyes = new Map<string, EyeController>()
  const eyeFor = (sessionId: string): EyeController => {
    let controller = eyes.get(sessionId)
    if (controller === undefined) {
      controller = createEyeController(pluginSettings, sessionId)
      controller.load()
      eyes.set(sessionId, controller)
    }
    return controller
  }

  // Plugin master switch (one switch controls the whole plugin).
  const features: FeatureController = createFeatureController(pluginSettings)
  features.load()
  const useFeaturesSnapshot = bindSnapshotSelector(features.store)
  /** Whether the plugin master switch is ON (gates the eye toggle, the
   * settings card's model sections, and every file-channel interception). */
  const usePluginEnabled = (): boolean => useFeaturesSnapshot(
    (s: { status: string; enabled?: boolean }) => s.status === 'ready' && s.enabled !== false,
  ) as boolean
  const useFeatures = (): import('./feature-controller.ts').FeatureState => useFeaturesSnapshot(
    (s: import('./feature-controller.ts').FeatureState) => s,
  ) as import('./feature-controller.ts').FeatureState

  // Pushed invalidations refresh loaded controllers without polling. The
  // plugin-owned RPC path also emits through pluginSettings.subscribe below;
  // this api-proxy event remains for external settings edits.
  const refreshPluginState = (): void => {
    for (const controller of eyes.values()) controller.load()
    features.load()
  }
  pluginSettings.subscribe(refreshPluginState)
  ctx.effect(() => {
    const dispose = ctx.remote.$on('settings/document-updated', refreshPluginState)
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

  /** Strict wire schema for the upload payload. */
  const parseUploadPayload = (value: unknown): { sessionId: string; name: string; data: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('payload must be an object')
    const record = value as Record<string, unknown>
    if (typeof record.sessionId !== 'string' || typeof record.name !== 'string' || typeof record.data !== 'string') {
      throw new Error('payload requires sessionId, name and data strings')
    }
    return { sessionId: record.sessionId, name: record.name, data: record.data }
  }

  /** Strict wire schema for the upload result. */
  const parseUploadResult = (value: unknown): { ok: true; path: string; name: string; size: number } | { ok: false; error: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('result must be an object')
    const record = value as Record<string, unknown>
    if (record.ok === true && typeof record.path === 'string' && typeof record.name === 'string' && typeof record.size === 'number') {
      return { ok: true, path: record.path, name: record.name, size: record.size }
    }
    if (record.ok === false && typeof record.error === 'string') return { ok: false, error: record.error }
    throw new Error('result must be { ok: true, path, name, size } or { ok: false, error }')
  }

  /** Strict wire schema for the ASR status. */
  const parseAsrStatus = (value: unknown): { installed: boolean; phase: string; model: string; error: string | null } => {
    if (typeof value !== 'object' || value === null) throw new Error('status must be an object')
    const record = value as Record<string, unknown>
    if (typeof record.installed !== 'boolean' || typeof record.phase !== 'string') throw new Error('status requires installed and phase')
    return {
      installed: record.installed,
      phase: record.phase,
      model: typeof record.model === 'string' ? record.model : 'medium',
      error: typeof record.error === 'string' ? record.error : null,
    }
  }

  /** Strict wire schema for the ASR install trigger. */
  const parseAsrInstallResult = (value: unknown): { ok: true; phase: string; already: boolean } | { ok: false; error: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('result must be an object')
    const record = value as Record<string, unknown>
    if (record.ok === true && typeof record.phase === 'string') {
      return { ok: true, phase: record.phase, already: record.already === true }
    }
    if (record.ok === false && typeof record.error === 'string') return { ok: false, error: record.error }
    throw new Error('result must be { ok: true, phase } or { ok: false, error }')
  }

  /** Strict wire schema for the session id argument. */
  const parseSessionId = (value: unknown): string => {
    if (typeof value !== 'string' || value === '') throw new Error('sessionId must be a non-empty string')
    return value
  }

  /** Strict wire schema for the modality result. */
  const parseModalityResult = (value: unknown): SessionModality => {
    if (typeof value !== 'object' || value === null) throw new Error('result must be an object')
    const record = value as Record<string, unknown>
    if (record.ok === true && typeof record.supportsImage === 'boolean') {
      return { ok: true, supportsImage: record.supportsImage }
    }
    if (record.ok === false && typeof record.error === 'string') return { ok: false, error: record.error }
    throw new Error('result must be { ok: true, supportsImage } or { ok: false, error }')
  }

  /** Strict wire schema for the read-upload payload. */
  const parseReadUploadPayload = (value: unknown): { sessionId: string; name: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('payload must be an object')
    const record = value as Record<string, unknown>
    if (typeof record.sessionId !== 'string' || typeof record.name !== 'string') {
      throw new Error('payload requires sessionId and name strings')
    }
    return { sessionId: record.sessionId, name: record.name }
  }

  /** Strict wire schema for the read-upload result. */
  const parseReadUploadResult = (value: unknown): { ok: true; mediaType: string; data: string } | { ok: false; error: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('result must be an object')
    const record = value as Record<string, unknown>
    if (record.ok === true && typeof record.mediaType === 'string' && typeof record.data === 'string') {
      return { ok: true, mediaType: record.mediaType, data: record.data }
    }
    if (record.ok === false && typeof record.error === 'string') return { ok: false, error: record.error }
    throw new Error('result must be { ok: true, mediaType, data } or { ok: false, error }')
  }

  /** Loose wire schema: pass the business object through unchanged (the host
   * shapes are validated by the caller-side wrappers). */
  const parseAsIs = (value: unknown): unknown => value

  /** Strict wire schema for the env-repair action. */
  const parseEnvRepairAction = (value: unknown): 'install-yt-dlp' | 'install-asr' => {
    if (value === 'install-yt-dlp' || value === 'install-asr') return value
    throw new Error('action must be install-yt-dlp or install-asr')
  }

  /** Strict wire schema for the test-provider probe. */
  const parseTestProvider = (value: unknown): { baseURL: string; apiKeyEnv: string; model: string; apiKey?: string } => {
    if (typeof value !== 'object' || value === null) throw new Error('provider must be an object')
    const record = value as Record<string, unknown>
    if (typeof record.baseURL !== 'string' || typeof record.apiKeyEnv !== 'string' || typeof record.model !== 'string') {
      throw new Error('provider requires baseURL, apiKeyEnv and model strings')
    }
    return {
      baseURL: record.baseURL,
      apiKeyEnv: record.apiKeyEnv,
      model: record.model,
      ...typeof record.apiKey === 'string' ? { apiKey: record.apiKey } : {},
    }
  }

  // Model-discovery + upload + ASR RPCs: mount the `remote.looklook`
  // namespace backed by the host LooklookRemoteService. Every method rides
  // the authorized connection (no unauth'd HTTP routes).
  ctx.effect(() => {
    const mounting = ctx.remote.$mount({
      package: 'dsh-looklook',
      descriptors: [
        {
          id: 'looklook.describeSettings',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'describeSettings',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookSettingsResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.updateSettings',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'updateSettings',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookSettingsUpdate', schema: { parse: parseAsIs } } }],
          result: { mode: 'strict', typeSymbol: 'LooklookSettingsUpdateResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.describeCredentials',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'describeCredentials',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'refs', wire: 'refs', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookCredentialRefs', schema: { parse: parseAsIs } } }],
          result: { mode: 'strict', typeSymbol: 'LooklookCredentialsResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.setCredential',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'setCredential',
          invocation: { kind: 'direct' },
          parameters: [{ name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict', typeSymbol: 'LooklookCredentialPayload', schema: { parse: parseAsIs } } }],
          result: { mode: 'strict', typeSymbol: 'LooklookCredentialResult', schema: { parse: parseAsIs } },
        },
        {
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
        },
        {
          id: 'looklook.upload',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'upload',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'LooklookUploadPayload', schema: { parse: parseUploadPayload } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookUploadResult', schema: { parse: parseUploadResult } },
        },
        {
          id: 'looklook.asrStatus',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'asrStatus',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookAsrStatus', schema: { parse: parseAsrStatus } },
        },
        {
          id: 'looklook.asrInstall',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'asrInstall',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookAsrInstallResult', schema: { parse: parseAsrInstallResult } },
        },
        {
          id: 'looklook.sessionModality',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'sessionModality',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'sessionId',
            wire: 'sessionId',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'SessionId', schema: { parse: parseSessionId } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookModalityResult', schema: { parse: parseModalityResult } },
        },
        {
          id: 'looklook.readUpload',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'readUpload',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'payload',
            wire: 'payload',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'LooklookReadUploadPayload', schema: { parse: parseReadUploadPayload } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookReadUploadResult', schema: { parse: parseReadUploadResult } },
        },
        {
          id: 'looklook.envCheck',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'envCheck',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookEnvCheckReport', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.envRepair',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'envRepair',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'action',
            wire: 'action',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'EnvRepairAction', schema: { parse: parseEnvRepairAction } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookEnvCheckItem', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.testVision',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'testVision',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'provider',
            wire: 'provider',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'TestProviderProbe', schema: { parse: parseTestProvider } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookTestVisionResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.testAudio',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'testAudio',
          invocation: { kind: 'direct' },
          parameters: [{
            name: 'provider',
            wire: 'provider',
            source: 'json',
            codec: { mode: 'strict', typeSymbol: 'TestProviderProbe', schema: { parse: parseTestProvider } },
          }],
          result: { mode: 'strict', typeSymbol: 'LooklookTestAudioResult', schema: { parse: parseAsIs } },
        },
      ],
    })
    return () => { void mounting.then(dispose => dispose()) }
  }, 'dsh-looklook: remote RPCs')

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

  /** Upload one file through the authorized RPC. */
  const uploadFileRpc = async (
    sessionId: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ path: string; name: string }> => {
    const remote = ctx.get('remote.looklook') as {
      upload?: (payload: { sessionId: string; name: string; data: string }) => Promise<
        { ok: boolean; value?: { ok: boolean; path?: string; error?: string }; error?: { message?: string } }
      >
    } | undefined
    return await uploadFile(remote, sessionId, file, onProgress)
  }

  /**
   * Upload a batch of files through the file channel (used by drop, paste,
   * and the + button picker). Each file becomes an immediate pending chip
   * (spinner + progress); the path lands when the RPC completes, and nothing
   * is sent until the user presses Enter. Failed uploads keep their chip with
   * the error visible.
   */
  const stageUploads = (sessionId: string, files: File[], controller: PendingFilesController): void => {
    void (async () => {
      for (const file of files) {
        const staged = { name: file.name, size: file.size, uploading: true, progress: 0 }
        controller.add(sessionId, staged)
        const id = controller.get(sessionId)[controller.get(sessionId).length - 1]?.id
        if (id === undefined) continue
        try {
          const { path } = await uploadFileRpc(sessionId, file, (percent) => {
            controller.updateById(sessionId, id, { progress: percent })
          })
          controller.updateById(sessionId, id, { path, uploading: false, progress: 100, error: undefined })
        } catch (error) {
          console.error('looklook upload failed:', file.name, error)
          controller.updateById(sessionId, id, {
            uploading: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()
  }

  /** Ask the host whether the session's current model accepts image input. */
  const sessionModality = async (sessionId: string): Promise<SessionModality> => {
    const remote = ctx.get('remote.looklook') as {
      sessionModality?: (sessionId: string) => Promise<
        { ok: boolean; value?: SessionModality; error?: { message?: string } }
      >
    } | undefined
    if (remote?.sessionModality === undefined) return { ok: false, error: '模态查询服务未就绪' }
    const envelope = await remote.sessionModality(sessionId)
    if (!envelope.ok) {
      return {
        ok: false,
        error: typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '模态查询失败',
      }
    }
    const business = envelope.value
    if (business?.ok === true) return { ok: true, supportsImage: business.supportsImage === true }
    return { ok: false, error: typeof business?.error === 'string' ? business.error : '模态查询失败' }
  }

  /** Read the local ASR install state through the authorized RPC. */
  const asrStatus = async (): Promise<{ installed: boolean; phase: string; model: string; options: { id: string; name: string; sizeLabel: string }[]; error: string | null }> => {
    const remote = ctx.get('remote.looklook') as {
      asrStatus?: () => Promise<
        { ok: boolean; value?: { installed: boolean; phase: string; model: string; options: { id: string; name: string; sizeLabel: string }[]; error: string | null } }
      >
    } | undefined
    if (remote?.asrStatus === undefined) throw new Error('ASR 状态服务未就绪')
    const envelope = await remote.asrStatus()
    if (!envelope.ok) throw new Error('ASR 状态查询失败')
    const value = envelope.value
    if (value === undefined) throw new Error('ASR 状态查询失败')
    return {
      installed: value.installed === true,
      phase: value.phase,
      model: value.model,
      options: Array.isArray(value.options) ? value.options : [],
      error: value.error ?? null,
    }
  }

  /** Trigger the local ASR install for one model through the authorized RPC.
   *  The model is EXCLUSIVE on the host: installing a different size purges
   *  the previous one. */
  const asrInstall = async (model: string): Promise<{ ok: true; phase: string; already: boolean } | { ok: false; error: string }> => {
    const remote = ctx.get('remote.looklook') as {
      asrInstall?: (payload: { model: string }) => Promise<
        { ok: boolean; value?: { ok: boolean; phase: string; already: boolean; error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.asrInstall === undefined) return { ok: false, error: 'ASR 安装服务未就绪' }
    const envelope = await remote.asrInstall({ model })
    if (!envelope.ok) {
      return {
        ok: false,
        error: typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? 'ASR 安装失败',
      }
    }
    const business = envelope.value
    if (business?.ok === true) return { ok: true, phase: business.phase, already: business.already === true }
    return { ok: false, error: typeof business?.error === 'string' ? business.error : 'ASR 安装失败' }
  }

  /** Run the environment self-check (settings dialog). */
  const envCheck = async (): Promise<EnvCheckReport> => {
    const remote = ctx.get('remote.looklook') as {
      envCheck?: () => Promise<
        { ok: boolean; value?: EnvCheckReport; error?: { message?: string } }
      >
    } | undefined
    if (remote?.envCheck === undefined) throw new Error('环境检测服务未就绪')
    const envelope = await remote.envCheck()
    if (!envelope.ok) {
      throw new Error(
        typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '环境检测失败',
      )
    }
    const report = envelope.value
    if (report === undefined) throw new Error('环境检测失败')
    return report
  }

  /** One-click repair for one env item; returns the item's fresh state. */
  const envRepair = async (action: 'install-yt-dlp' | 'install-asr'): Promise<EnvCheckItem> => {
    const remote = ctx.get('remote.looklook') as {
      envRepair?: (action: string) => Promise<
        { ok: boolean; value?: EnvCheckItem; error?: { message?: string } }
      >
    } | undefined
    if (remote?.envRepair === undefined) throw new Error('修复服务未就绪')
    const envelope = await remote.envRepair(action)
    if (!envelope.ok) {
      throw new Error(
        typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '修复失败',
      )
    }
    const item = envelope.value
    if (item === undefined) throw new Error('修复失败')
    return item
  }

  /** Probe whether one vision provider can actually see images. */
  const testVision = async (provider: {
    baseURL: string
    apiKeyEnv: string
    apiKey?: string
    model: string
  }): Promise<{ ok: true; supportsImage: boolean; message: string } | { ok: false; error: string }> => {
    const remote = ctx.get('remote.looklook') as {
      testVision?: (p: {
        baseURL: string
        apiKeyEnv: string
        apiKey?: string
        model: string
      }) => Promise<
        { ok: boolean; value?: { ok: boolean; supportsImage: boolean; message: string; error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.testVision === undefined) return { ok: false, error: '测试服务未就绪' }
    const envelope = await remote.testVision(provider)
    if (!envelope.ok) {
      return {
        ok: false,
        error: typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '测试失败',
      }
    }
    const business = envelope.value
    if (business?.ok === true) return { ok: true, supportsImage: business.supportsImage === true, message: business.message ?? '' }
    return { ok: false, error: typeof business?.error === 'string' ? business.error : '测试失败' }
  }

  /** Probe one audio provider's capability level (L1/L2/none). */
  const testAudio = async (provider: {
    baseURL: string
    apiKeyEnv: string
    apiKey?: string
    model: string
  }): Promise<{ ok: true; level: 'L1' | 'L2' | 'none'; message: string } | { ok: false; error: string }> => {
    const remote = ctx.get('remote.looklook') as {
      testAudio?: (p: {
        baseURL: string
        apiKeyEnv: string
        apiKey?: string
        model: string
      }) => Promise<
        { ok: boolean; value?: { ok: boolean; level: 'L1' | 'L2' | 'none'; message: string; error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.testAudio === undefined) return { ok: false, error: '测试服务未就绪' }
    const envelope = await remote.testAudio(provider)
    if (!envelope.ok) {
      return {
        ok: false,
        error: typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '测试失败',
      }
    }
    const business = envelope.value
    if (business?.ok === true) return { ok: true, level: business.level ?? 'none', message: business.message ?? '' }
    return { ok: false, error: typeof business?.error === 'string' ? business.error : '测试失败' }
  }

  // Modality cache: sessionId → supportsImage. Refreshed on session change
  // and whenever settings change (a model switch does not change the session
  // id, so the cache must be invalidated on settings updates too).
  const modalityCache = new Map<string, boolean>()
  const cachedSupportsImage = (sessionId: string): boolean | undefined => modalityCache.get(sessionId)

  // Probe one session's modality and remember the result. A failed probe
  // (e.g. remote.looklook still mounting at apply time) schedules ONE retry
  // shortly after, so cold-start probes are not permanently lost. Uses the
  // browser global timer (the client runs in the page; dsh-client-runtime
  // itself relies on the same global).
  const probeModality = (sessionId: string, retriesLeft = 2): void => {
    void sessionModality(sessionId).then(result => {
      if (result.ok) {
        modalityCache.set(sessionId, result.supportsImage)
        return
      }
      if (retriesLeft > 0) {
        window.setTimeout(() => probeModality(sessionId, retriesLeft - 1), 600)
      }
    }).catch(() => { /* keep unknown */ })
  }

  // Refresh the modality cache when the session changes.
  ctx.effect(() => {
    const sync = (): void => {
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId === undefined || sessionId === '') return
      probeModality(sessionId)
    }
    const dispose = sessions.currentProvideInfo.subscribe(sync)
    sync()
    return () => { dispose() }
  }, 'dsh-looklook: modality cache')

  // Invalidate the modality cache on every settings update (model switch,
  // provider change, eye toggle) so the next drop re-probes.
  ctx.effect(() => {
    const dispose = ctx.remote.$on('settings/document-updated', () => {
      modalityCache.clear()
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId !== undefined && sessionId !== '') probeModality(sessionId)
    })
    return () => { dispose() }
  }, 'dsh-looklook: modality invalidation')

  // ── Plugins settings → 插件配置: the looklook card (switches + vision + ASR). ──
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: PLUGIN_CARD_ID,
    order: 30,
    inject: (): LooklookCardInjected => ({
      api: connection.api,
      pluginSettings,
      t,
      features,
      useFeatures,
      listModels,
      testVision,
      testAudio,
      asrStatus,
      asrInstall,
      envCheck,
      envRepair,
      usePluginEnabled,
    }),
  }, LooklookPluginCard))

  // Drag-and-drop of files onto the page: intercept in the CAPTURE phase.
  // Rule per drop:
  // - A drop that contains a NON-image file is always intercepted (archives,
  //   videos) — the native pipeline has no place for them.
  // - A drop that contains ONLY images is intercepted ONLY when the session
  //   eye is ON (the per-session "看看" toggle) AND the model is NOT
  //   image-capable (text-only: route through the file channel). When the
  //   eye is OFF the drop passes through untouched (native behavior, for
  //   multi-modal model sessions that want the full native pipeline); when
  //   the cached modality says the model can see images, the drop also passes
  //   through untouched.
  ctx.effect(() => {
    const onDragOverCapture = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files') === true) {
        event.preventDefault()
      }
    }
    const onDropCapture = (event: DragEvent): void => {
      // Master switch OFF → plugin dormant, DSH behaves as without it.
      const master = features.store.getSnapshot()
      if (master.status === 'ready' && master.enabled === false) return
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length === 0) return
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId === undefined || sessionId === '') return

      const hasNonImage = files.some(file => isUploadableName(file.name))
      if (!hasNonImage) {
        // All images: intercept only when the eye is on AND the model is
        // text-only. Eye off → native pipeline (full native experience).
        const eye = eyeFor(sessionId).store.getSnapshot()
        if (eye.status === 'ready' && eye.eye === 'off') return
        const supportsImage = cachedSupportsImage(sessionId)
        if (supportsImage === true) return // native pipeline handles it
        // Unknown modality is treated conservatively as text-only so images
        // always land somewhere the model can see them; a later refresh will
        // flip multi-modal sessions back to native.
      }

      event.preventDefault()
      event.stopPropagation()
      // We intercepted the drop, so the built-in handler never runs its
      // reset() — dispatch a dragend so the full-page drop overlay (the
      // frosted mask) dismisses instead of sticking.
      window.dispatchEvent(new DragEvent('dragend'))
      void stageUploads(sessionId, files, pending)
    }
    document.addEventListener('dragover', onDragOverCapture, true)
    document.addEventListener('drop', onDropCapture, true)

    // Paste (Ctrl+V) images: intercept in CAPTURE so the native composer
    // paste handler (bubble phase) never sees them — route through the file
    // channel exactly like a drop.
    const onPasteCapture = (event: ClipboardEvent): void => {
      if (event.clipboardData === null) return
      // Master switch OFF → plugin dormant, DSH behaves as without it.
      const master = features.store.getSnapshot()
      if (master.status === 'ready' && master.enabled === false) return
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId === undefined || sessionId === '') return
      const imageFiles = [...event.clipboardData.items]
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null)
      if (imageFiles.length === 0) return
      // Same modality gate as drop: eye off → native; model sees images →
      // native; otherwise file channel.
      const eye = eyeFor(sessionId).store.getSnapshot()
      if (eye.status === 'ready' && eye.eye === 'off') return
      const supportsImage = cachedSupportsImage(sessionId)
      if (supportsImage === true) return
      event.preventDefault()
      event.stopPropagation()
      void stageUploads(sessionId, imageFiles, pending)
    }
    document.addEventListener('paste', onPasteCapture, true)

    // "+ 按钮" file picker: the picker commits through an <input type=file>
    // change event. Intercept in CAPTURE so image picks never reach the
    // native intake; only when the session routes images through the file
    // channel. Non-image picks (if any) are left to native.
    const onChangeCapture = (event: Event): void => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      if (input.type !== 'file') return
      // Master switch OFF → plugin dormant, DSH behaves as without it.
      const master = features.store.getSnapshot()
      if (master.status === 'ready' && master.enabled === false) return
      const files = [...(input.files ?? [])]
      if (files.length === 0) return
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId === undefined || sessionId === '') return
      const imageFiles = files.filter(file => isNativeImageName(file.name) || file.type.startsWith('image/'))
      if (imageFiles.length === 0) return
      const eye = eyeFor(sessionId).store.getSnapshot()
      if (eye.status === 'ready' && eye.eye === 'off') return
      const supportsImage = cachedSupportsImage(sessionId)
      if (supportsImage === true) return
      event.preventDefault()
      event.stopPropagation()
      // Clear the picker so the same file can be chosen again.
      input.value = ''
      void stageUploads(sessionId, imageFiles, pending)
    }
    document.addEventListener('change', onChangeCapture, true)

    return () => {
      document.removeEventListener('dragover', onDragOverCapture, true)
      document.removeEventListener('drop', onDropCapture, true)
      document.removeEventListener('paste', onPasteCapture, true)
      document.removeEventListener('change', onChangeCapture, true)
    }
  }, 'dsh-looklook: file drag-and-drop')

  // Pending file chips (like image attachments, removable, sent with the
  // next Enter/send — the submit patch merges their notes), rendered above
  // the composer card (input.dock), where image thumbnails go.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: PENDING_ID,
    inject: (sessionId: string): FileChipsInjected => {
      ensureSubmitPatched(sessionId)
      return { t, pending, usePending, sessionId }
    },
  }, FileChips))

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
        usePluginEnabled,
      }
    },
  }, VisionToggle))

  // Render the ORIGINAL image in user messages (native position, plugin
  // renderer so the original image + file-channel thumbnails show inline).
  const chatNodeInject = (): { sessionId: string; loadUpload: import('./UserMessageNodeView.tsx').UploadImageLoader } => {
    const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId ?? ''
    const loadUpload: import('./UserMessageNodeView.tsx').UploadImageLoader = async (sid, name) => {
      const remote = ctx.get('remote.looklook') as {
        readUpload?: (payload: { sessionId: string; name: string }) => Promise<
          { ok: boolean; value?: { ok: boolean; mediaType: string; data: string; error?: string }; error?: { message?: string } }
        >
      } | undefined
      if (remote?.readUpload === undefined) return { ok: false, error: '图片读取服务未就绪' }
      const envelope = await remote.readUpload({ sessionId: sid, name })
      if (!envelope.ok) {
        return {
          ok: false,
          error: typeof envelope.error === 'string'
            ? envelope.error
            : envelope.error?.message ?? '图片读取失败',
        }
      }
      const business = envelope.value
      if (business?.ok === true && typeof business.mediaType === 'string' && typeof business.data === 'string') {
        return { ok: true, mediaType: business.mediaType, data: business.data }
      }
      return { ok: false, error: typeof business?.error === 'string' ? business.error : '图片读取失败' }
    }
    return { sessionId, loadUpload }
  }

  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'user',
    priority: -1,
    locale: NS,
    inject: chatNodeInject,
  }, LooklookUserMessageNodeView))
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'steering',
    priority: -1,
    locale: NS,
    inject: chatNodeInject,
  }, LooklookUserMessageNodeView))
}
