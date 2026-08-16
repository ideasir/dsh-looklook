/**
 * Per-session eye-toggle controller. Reads and writes the `vision` settings
 * namespace (`sessionOverrides[sessionId]`, default `on`) through the wire
 * settings API, and reports whether any enabled provider is configured so the
 * toggle can warn when the eye is on but recognition is not configured.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
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
export function createEyeController(api: IApiClient, sessionId: string): EyeController {
  const store = createSnapshotStore<EyeState>({ status: 'loading' })
  const refresh = async (): Promise<void> => {
    const response = await api.settings.describe({})
    if (!response.result.ok) {
      store.set({ status: 'ready', eye: 'on', unconfigured: true })
      return
    }
    const vision = namespaceValueOf(response.result.value.namespaces, 'vision') as VisionSettingsView | undefined
    const eye = vision?.sessionOverrides?.[sessionId] ?? 'on'
    const unconfigured = !(vision?.providers ?? []).some(provider => provider.enabled !== false)
    store.set({ status: 'ready', eye, unconfigured })
  }
  return {
    store,
    load: () => { void refresh() },
    toggle: (next) => {
      void (async () => {
        await api.settings.update({
          ns: 'vision',
          patch: { sessionOverrides: { [sessionId]: next } },
        })
        void refresh()
      })()
    },
  }
}
