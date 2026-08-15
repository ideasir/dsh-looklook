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
import { isUploadableName, uploadFile } from './upload-shared.ts'
import { en, zh, type LookLookKey } from './locales.ts'

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
  }

  // Pending staged files (uploaded, waiting for the user to press Enter).
  const pending: PendingFilesController = createPendingFilesController()
  const usePending = bindSnapshotSelector(pending.store)

  /**
   * Patch the session input SHELL's submit (both Enter and the send button
   * route through it — keyboard.submit and actions.submit both call
   * shell.submit) so staged file notes are merged into the outgoing message.
   */
  const wrapSubmit = (): boolean => {
    const current = sessions.currentProvideInfo.getSnapshot()
    const sessionId = current?.sessionId
    if (sessionId === undefined) return false
    const conversation = ctx.get('conversation') as {
      input?: { shell?: (id: string) => {
        state?: { getSnapshot(): { draft?: string } }
        setDraft?: (text: string) => void
        submit?: (mode?: string) => void
      } }
    } | undefined
    const shell = conversation?.input?.shell?.(sessionId)
    if (shell?.submit === undefined || shell?.setDraft === undefined) return false
    const wrapped = shell as { __looklookWrapped?: boolean; submit?: (mode?: string) => void }
    if (wrapped.__looklookWrapped === true) return true
    wrapped.__looklookWrapped = true
    const originalSubmit = shell.submit.bind(shell)
    const setDraft = shell.setDraft
    const readDraft = (): string => shell.state?.getSnapshot()?.draft ?? ''
    wrapped.submit = (mode?: string) => {
      try {
        const staged = pending.get(sessionId)
        if (staged.length > 0) {
          // The model sees the path; the UI renders a file card from the
          // 【looklook:file】 marker and hides the path text.
          const notes = staged.map(f => {
            const visible = t('upload.message', { name: f.name, path: f.path })
            const meta = JSON.stringify({ name: f.name, path: f.path, size: f.size })
            return `【looklook:开始】${visible}【looklook:结束】\n【looklook:file】${meta}【looklook:file】`
          }).join('\n')
          const draft = readDraft()
          setDraft(draft === '' ? notes : `${draft}\n${notes}`)
          pending.clear(sessionId)
        }
      } catch (error) {
        // Never let the merge break sending — the original submit must run.
        console.error('looklook submit merge failed:', error)
      }
      originalSubmit(mode)
    }
    return true
  }
  sessions.currentProvideInfo.subscribe(wrapSubmit)
  wrapSubmit()

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
  const useFeatures = (): import('./feature-controller.ts').FeatureState => useFeaturesSnapshot(
    (s: import('./feature-controller.ts').FeatureState) => s,
  ) as import('./feature-controller.ts').FeatureState
  /** Current policy for the drop handler (reads the live store, not reactive). */
  const policyAt = (): 'base' | 'extended' => {
    const state = features.store.getSnapshot()
    return state.status === 'ready' && state.moreExtensions !== false ? 'extended' : 'base'
  }

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

  // ── Plugins settings → 插件配置: the looklook card (switches + 7z + vision). ──
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: PLUGIN_CARD_ID,
    order: 30,
    inject: (): LooklookCardInjected => ({ api: connection.api, t, features, useFeatures, listModels, useMultimodal }),
  }, LooklookPluginCard))

  // Drag-and-drop of archive/video files onto the page: intercept in the
  // CAPTURE phase (before the built-in image-only drop handler in bubble
  // phase), upload through the looklook route, and send the file paths as a
  // user message. Image-only drops and mixed drops pass through untouched so
  // the native image pipeline keeps working.
  ctx.effect(() => {
    const onDragOverCapture = (event: DragEvent): void => {
      if (event.dataTransfer?.types.includes('Files') === true) {
        event.preventDefault()
      }
    }
    const onDropCapture = (event: DragEvent): void => {
      const files = [...(event.dataTransfer?.files ?? [])]
      if (files.length === 0) return
      // Intercept only when EVERY dropped file is allowed by the current
      // extension policy; otherwise the built-in handler deals with the drop
      // (images stay native).
      const policy = policyAt()
      const allowed = (name: string): boolean => {
        if (policy === 'base') return name.toLowerCase().endsWith('.zip')
        return isUploadableName(name)
      }
      if (!files.every(file => allowed(file.name))) return
      const sessionId = sessions.currentProvideInfo.getSnapshot()?.sessionId
      if (sessionId === undefined || sessionId === '') return
      event.preventDefault()
      event.stopPropagation()
      // We intercepted the drop, so the built-in handler never runs its
      // reset() — dispatch a dragend so the full-page drop overlay (the
      // frosted mask) dismisses instead of sticking.
      window.dispatchEvent(new DragEvent('dragend'))
      // Upload now and show the file as a pending attachment chip — nothing
      // is sent until the user presses Enter (like image attachments); the
      // submit wrapper merges the paths into the outgoing message.
      void (async () => {
        const results = await Promise.all(files.map(async (file) => {
          try {
            const { path } = await uploadFile(sessionId, file)
            return { name: file.name, path, size: file.size }
          } catch (error) {
            console.error('looklook upload failed:', file.name, error)
            return null
          }
        }))
        const staged = results.filter((r): r is { name: string; path: string; size: number } => r !== null)
        for (const result of staged) pending.add(sessionId, result)
        // Ensure the submit wrapper is in place by the time the user presses
        // Enter; if it cannot be installed, fall back to sending the paths as
        // a user message right away so the file is never lost.
        const wrapped = wrapSubmit()
        if (!wrapped && staged.length > 0) {
          const text = staged.map(f => {
            const visible = t('upload.message', { name: f.name, path: f.path })
            const meta = JSON.stringify({ name: f.name, path: f.path, size: f.size })
            return `【looklook:开始】${visible}【looklook:结束】\n【looklook:file】${meta}【looklook:file】`
          }).join('\n')
          try {
            await connection.api.sessions.prompt({
              sessionId: sessionId as never,
              mode: 'queue' as never,
              content: [{ type: 'text', text }] as never,
            } as never)
            pending.clear(sessionId)
          } catch (error) {
            console.error('looklook fallback send failed:', error)
          }
        }
      })()
    }
    document.addEventListener('dragover', onDragOverCapture, true)
    document.addEventListener('drop', onDropCapture, true)
    return () => {
      document.removeEventListener('dragover', onDragOverCapture, true)
      document.removeEventListener('drop', onDropCapture, true)
    }
  }, 'dsh-looklook: archive/video drag-and-drop')

  // Pending file chips (like image attachments, removable, sent on Enter),
  // rendered above the composer card (input.dock), where image thumbnails go.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: PENDING_ID,
    inject: (sessionId: string): FileChipsInjected => ({ t, pending, usePending, sessionId }),
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
      }
    },
  }, VisionToggle))

  // Render the ORIGINAL image in user messages.
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
