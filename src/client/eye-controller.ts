/**
 * Per-session eye-toggle controller. Reads the `vision` settings namespace
 * (`sessionOverrides[sessionId]`, default `on`) through the wire settings
 * API, and reports whether any enabled provider is configured so the
 * toggle can warn when the eye is on but recognition is not configured.
 *
 * Race-condition fix: when `api.describe()` fails (remote not yet mounted),
 * retry after a short delay instead of defaulting to unconfigured=true.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { PluginSettingsClient } from './plugin-settings.ts'
import { namespaceValueOf } from './settings-view.ts'

/** Eye toggle state for one session. */
export type EyeState =
  | { status: 'loading' }
  | { status: 'ready'; eye: 'on' | 'off'; unconfigured: boolean }

/** The `vision` settings namespace value as read through the wire. */
interface VisionSettingsView {
  providers?: Array<{ enabled?: boolean }>
  sessionOverrides?: Record<string, 'on' | 'off'>
}

/** Per-session eye controller: one store, load, and toggle. */
export interface EyeController {
  store: SnapshotStore<EyeState>
  load(): void
  toggle(next: 'on' | 'off'): void
}

/** Create the controller for one session. */
export function createEyeController(api: PluginSettingsClient, sessionId: string): EyeController {
  const store = createSnapshotStore<EyeState>({ status: 'loading' })
  let retryTimer: number | null = null
  const refresh = async (): Promise<void> => {
    const response = await api.describe()
    if (!response.ok) {
      // Remote not ready yet — retry after 600ms instead of defaulting to
      // unconfigured=true (which would show the yellow warning on a fresh
      // page load before the remote RPC namespace is mounted).
      retryTimer = window.setTimeout(() => void refresh(), 600)
      return
    }
    const vision = namespaceValueOf(response.namespaces, 'vision') as VisionSettingsView | undefined
    const eye = vision?.sessionOverrides?.[sessionId] ?? 'on'
    const unconfigured = !(vision?.providers ?? []).some(provider => provider.enabled !== false)
    store.set({ status: 'ready', eye, unconfigured })
  }
  return {
    store,
    load: () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      void refresh()
    },
    toggle: (next) => {
      void (async () => {
        await api.update('vision', { sessionOverrides: { [sessionId]: next } })
        void refresh()
      })()
    },
  }
}