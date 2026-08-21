/**
 * dsh-looklook client face:
 * - the looklook entry inside the Plugins settings section (master switches +
 *   conditional vision-model config);
 * - drag-and-drop of archive/video files straight into the dialog;
 * - the per-session eye toggle and the original-image message view.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { bindSnapshotSelector } from './bind-snapshot.ts'
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
import { CopySessionIdButton, type CopySessionIdInjected } from './CopySessionIdButton.tsx'
import { installChatMinimap } from './ChatMinimap.ts'
import { LooklookUserMessageNodeView } from './UserMessageNodeView.tsx'
import { LooklookPluginCard, type LooklookCardInjected } from './PluginTab.tsx'
import { VisionToggle, type VisionToggleInjected } from './VisionToggle.tsx'
import { FileChips, type FileChipsInjected } from './FileChips.tsx'
import { isUploadableName, isNativeImageName, uploadFile, type SessionModality, type EnvCheckItem, type EnvCheckReport, type CapabilityItem, type CapabilityReport } from './upload-shared.ts'
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

  // ── Session sharing ──────────────────────────────────────────
  // The sidebar 3-dot menu already has a "Share session…" item that calls
  // window.__dshShareSession?.(sessionId, title).  Register it so the user
  // can copy a session reference (dsh-session:// URI + title) to the
  // clipboard and paste it into another session for analysis.
  // The "标题:" prefix on the title line prevents the Agent from treating
  // the session title as a command — it is clearly metadata.
  if (typeof window !== 'undefined') {
    ctx.effect(() => {
      const win = window as unknown as Record<string, unknown>
      win.__dshShareSession = (sessionId: string, title: string | undefined) => {
        const ref = 'dsh-session://' + sessionId
        const text = title ? `dsh-session://${sessionId}\n标题: ${title}` : ref
        void navigator.clipboard?.writeText?.(text).catch(() => {
          // Fallback for older browsers / non-HTTPS.
          const ta = document.createElement('textarea')
          ta.value = text
          ta.style.cssText = 'position:fixed;left:-9999px'
          document.body.appendChild(ta)
          ta.select()
          try { document.execCommand('copy') } catch { /* ignore */ }
          document.body.removeChild(ta)
        })
        // Brief toast feedback.
        const el = document.createElement('div')
        el.textContent = '已复制会话引用（dsh-session://），可粘贴到其他对话'
        el.style.cssText = [
          'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
          'z-index:99999', 'background:var(--dsw-alias-bg-base,#1a1a2e)',
          'color:var(--dsw-alias-label-primary,#e0e0e0)',
          'border:1px solid var(--dsw-alias-border-l2,#333)',
          'border-radius:10px', 'padding:10px 20px', 'font-size:14px',
          'box-shadow:0 4px 16px rgba(0,0,0,0.3)', 'max-width:80vw',
          'text-align:center', 'word-break:break-all',
          'transition:opacity .25s',
        ].join(';')
        document.body.appendChild(el)
        setTimeout(() => { el.style.opacity = '0' }, 2200)
        setTimeout(() => { document.body.removeChild(el) }, 2700)
      }
      return () => { delete win.__dshShareSession }
    }, 'dsh-looklook: session share global')
  }

  // Pending staged files (uploaded, shown as chips, sent with Enter).
  const pending: PendingFilesController = createPendingFilesController()
  const usePending = bindSnapshotSelector(pending.store)

  /** Compose a human-readable file note for one uploaded file.
   *  Format: [压缩包] 文件名.zip【looklook:file】{json}【looklook:file】
   *  The queue bubble shows the friendly prefix; the final render
   *  parses the JSON into a file card (thumbnail / icon + tooltip). */
  const fileTypeLabel = (name: string): string => {
    const ext = name.toLowerCase().split('.').pop() ?? ''
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'psd', 'tiff', 'ico', 'heic', 'heif', 'raw'].includes(ext)) return '图片'
    if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg'].includes(ext)) return '视频'
    if (['zip', '7z', 'rar', 'tar', 'gz', 'xz', 'bz2', 'lz', 'zst'].includes(ext)) return '压缩包'
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'tsv', 'ods', 'odp', 'key'].includes(ext)) return '文档'
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(ext)) return '音频'
    if (['exe', 'msi', 'dmg', 'app', 'deb', 'rpm', 'apk', 'jar'].includes(ext)) return '文件'
    if (['py', 'js', 'ts', 'jsx', 'tsx', 'css', 'html', 'json', 'yaml', 'yml', 'xml', 'php', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'sh', 'bash'].includes(ext)) return '代码'
    return '文件'
  }
  /** Human-readable file size. */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const fileNote = (f: { name: string; path?: string; size: number }): string => {
    const label = fileTypeLabel(f.name)
    const serverName = f.path ? f.path.split('/').pop() ?? f.name : f.name
    return `[${label}]${f.name} (${formatFileSize(f.size)}) [f:${serverName}]`
  }

  /** Global file registry: sessionId → filename → FileMeta. */
  const fileRegistry = new Map<string, Map<string, { name: string; displayName: string; path: string; size: number }>>()

  /**
   * Merge every staged file's note into the current draft. Returns the
   * merged draft text; the caller triggers the send.  Saves metadata into
   * the global fileRegistry so the sent-message renderer can build cards.
   */
  const mergeNotesIntoDraft = (sessionId: string, draft: string): string => {
    const staged = pending.get(sessionId).filter(
      f => f.path !== undefined && f.path !== '' && f.uploading !== true && f.error === undefined,
    )
    if (staged.length === 0) return draft
    const notes = staged.map(fileNote).join('\n')
    // Save metadata into the global registry for the renderer.
    // Key = original filename (f.name) so the text [图片]f.name matches.
    const reg = new Map(fileRegistry.get(sessionId) ?? [])
    for (const f of staged) {
      const serverName = f.path ? f.path.split('/').pop() ?? f.name : f.name
      reg.set(f.name, { name: serverName, displayName: f.name, path: f.path ?? '', size: f.size })
    }
    fileRegistry.set(sessionId, reg)
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
   * Patch the session's submit() so staged file notes are merged into the
   * draft before sending. Runs once per session.
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
        if (merged !== draft) {
          setDraft(merged)
          originalSubmit(mode)
          setDraft(draft) // restore draft immediately so user never sees raw marker
        } else {
          originalSubmit(mode)
        }
      } catch (error) {
        console.error('looklook submit merge failed:', error)
        originalSubmit(mode)
      }
    }
    patchedSessions.add(sessionId)
  }

  // Patch the current session's submit whenever the session changes.
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
  const parseEnvRepairAction = (value: unknown): 'install-yt-dlp' => {
    if (value === 'install-yt-dlp') return value
    throw new Error('action must be install-yt-dlp')
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

  // Model-discovery + upload RPCs: mount the `remote.looklook`
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
          id: 'looklook.capabilityCheck',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'capabilityCheck',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookCapabilityReport', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.getPluginVersion',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'getPluginVersion',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookVersionResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.checkUpdate',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'checkUpdate',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookUpdateResult', schema: { parse: parseAsIs } },
        },
        {
          id: 'looklook.uninstallPlugin',
          service: 'looklookRemote',
          namespace: 'looklook',
          method: 'uninstallPlugin',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'LooklookUninstallResult', schema: { parse: parseAsIs } },
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
        const staged = {
          name: file.name,
          size: file.size,
          ...(file.type.startsWith('image/') || file.type.startsWith('video/') ? { previewUrl: URL.createObjectURL(file) } : {}),
          uploading: true,
          progress: 0,
        }
        controller.add(sessionId, staged)
        const id = controller.get(sessionId)[controller.get(sessionId).length - 1]?.id
        if (id === undefined) continue
        try {
          const { path } = await uploadFileRpc(sessionId, file, (percent) => {
            controller.updateById(sessionId, id, { progress: percent })
          })
          controller.updateById(sessionId, id, {
            path,
            uploading: false,
            progress: 100,
            error: undefined,
          })
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

  /** 功能能力自检（图像/视频/声音/PSD/Office/视频平台）。 */
  const capabilityCheck = async (): Promise<CapabilityReport> => {
    const remote = ctx.get('remote.looklook') as {
      capabilityCheck?: () => Promise<
        { ok: boolean; value?: CapabilityReport; error?: { message?: string } }
      >
    } | undefined
    if (remote?.capabilityCheck === undefined) throw new Error('功能检测服务未就绪')
    const envelope = await remote.capabilityCheck()
    if (!envelope.ok) {
      throw new Error(
        typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message ?? '功能检测失败',
      )
    }
    const report = envelope.value
    if (report === undefined) throw new Error('功能检测失败')
    return report
  }

  /** 获取插件版本号。 */
  const getPluginVersion = async (): Promise<string> => {
    const remote = ctx.get('remote.looklook') as {
      getPluginVersion?: () => Promise<
        { ok: boolean; value?: { version: string } | { error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.getPluginVersion === undefined) return ''
    try {
      const envelope = await remote.getPluginVersion()
      if (!envelope.ok) return ''
      const value = envelope.value
      if (value === undefined) return ''
      return 'version' in value ? value.version : ''
    } catch {
      return ''
    }
  }

  /** 检查 GitHub 是否有更新。 */
  const checkUpdate = async (): Promise<{ hasUpdate: boolean; remoteVersion: string }> => {
    const remote = ctx.get('remote.looklook') as {
      checkUpdate?: () => Promise<
        { ok: boolean; value?: { hasUpdate: boolean; remoteVersion: string } | { error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.checkUpdate === undefined) return { hasUpdate: false, remoteVersion: '' }
    try {
      const envelope = await remote.checkUpdate()
      if (!envelope.ok) return { hasUpdate: false, remoteVersion: '' }
      const value = envelope.value
      if (value === undefined || !('hasUpdate' in value)) return { hasUpdate: false, remoteVersion: '' }
      return { hasUpdate: value.hasUpdate, remoteVersion: value.remoteVersion }
    } catch {
      return { hasUpdate: false, remoteVersion: '' }
    }
  }

  /** 卸载 looklook 插件。 */
  const uninstallPlugin = async (): Promise<{ ok: boolean; error?: string }> => {
    const remote = ctx.get('remote.looklook') as {
      uninstallPlugin?: () => Promise<
        { ok: boolean; value?: { restart: boolean } | { error?: string }; error?: { message?: string } }
      >
    } | undefined
    if (remote?.uninstallPlugin === undefined) return { ok: false, error: '卸载服务未就绪' }
    try {
      const envelope = await remote.uninstallPlugin()
      if (!envelope.ok) {
        return { ok: false, error: typeof envelope.error === 'string' ? envelope.error : envelope.error?.message ?? '卸载失败' }
      }
      const value = envelope.value
      if (value === undefined || !('restart' in value)) return { ok: false, error: '卸载失败' }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** One-click repair for one env item; returns the item's fresh state. */
  const envRepair = async (action: 'install-yt-dlp'): Promise<EnvCheckItem> => {
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

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: PLUGIN_CARD_ID,
    priority: 30,
    inject: (): LooklookCardInjected => ({
      api: connection.api,
      pluginSettings,
      t,
      features,
      useFeatures,
      listModels,
      testVision,
      testAudio,
      envCheck,
      envRepair,
      capabilityCheck,
      getPluginVersion,
      checkUpdate,
      uninstallPlugin,
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
    // native intake for image-only picks when the session is natively
    // multimodal. Non-image picks must always use Look Look's file channel.
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
      const hasNonImage = files.some(file => isUploadableName(file.name))
      if (!hasNonImage) {
        const eye = eyeFor(sessionId).store.getSnapshot()
        if (eye.status === 'ready' && eye.eye === 'off') return
        const supportsImage = cachedSupportsImage(sessionId)
        if (supportsImage === true) return
      }
      event.preventDefault()
      event.stopPropagation()
      // Clear the picker so the same file can be chosen again.
      input.value = ''
      void stageUploads(sessionId, files, pending)
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
  // next Enter/send — the submit patch merges their notes), rendered INSIDE
  // the composer card (input.attachments), where native image thumbnails go.
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
  const chatNodeInject = (): { sessionId: string; loadUpload: import('./UserMessageNodeView.tsx').UploadImageLoader; fileRegistry: Map<string, Map<string, { name: string; displayName: string; path: string; size: number }>> } => {
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
    return { sessionId, loadUpload, fileRegistry }
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

  // Copy-session-id button, rendered in the assistant-actions row (next to
  // copy-text / branch).  Copies `dsh-session://<id>\n标题: <title>`.
  const copySessionIdInject = (): CopySessionIdInjected => {
    const info = sessions.currentProvideInfo.getSnapshot()
    const sessionId = info?.sessionId ?? ''
    let title = ''
    const list = (sessions as unknown as { list?: { getSnapshot(): { byId: Record<string, { displayTitle?: string }> } } })?.list?.getSnapshot?.()
    const row = list?.byId[sessionId]
    if (row && typeof row.displayTitle === 'string') title = row.displayTitle
    return { sessionId, title }
  }
  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'looklook-copy-session-id',
    order: 10,
    inject: copySessionIdInject,
  }, CopySessionIdButton))

  // ── Chat minimap — left-side vertical dash bar ────────────────
  ctx.effect(() => { installChatMinimap(); return () => {} }, 'dsh-looklook: chat minimap')
}
