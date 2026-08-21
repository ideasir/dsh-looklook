/**
 * Plugin master-switch controller: reads the `looklook` settings namespace
 * (`enabled`) through the wire settings API. One switch controls the whole
 * plugin — ON (default) = every capability enabled; OFF = plugin dormant and
 * DSH behaves as without it.
 *
 * Race-condition fix: when `api.describe()` fails (remote not yet mounted),
 * retry after a short delay instead of defaulting to enabled=true. The remote
 * mounts within ~500ms on a fresh page load.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { PluginSettingsClient } from './plugin-settings.ts'
import { namespaceValueOf } from './settings-view.ts'

/** Master-switch state. */
export type FeatureState =
  | { status: 'loading' }
  | { status: 'ready'; enabled: boolean }

/** The `looklook` settings namespace value as read through the wire. */
interface LooklookSettingsView {
  enabled?: boolean
}

/** Plugin master-switch controller: one store + load + update. */
export interface FeatureController {
  store: SnapshotStore<FeatureState>
  load(): void
  setEnabled(next: boolean): void
}

/** Create the plugin master-switch controller. */
export function createFeatureController(api: PluginSettingsClient): FeatureController {
  const store = createSnapshotStore<FeatureState>({ status: 'loading' })
  let retryTimer: number | null = null
  const refresh = async (): Promise<void> => {
    const response = await api.describe()
    if (!response.ok) {
      // Remote not ready yet — retry after 600ms instead of defaulting to
      // enabled=true (which would make the switch appear ON on a fresh page
      // load before the remote RPC namespace is mounted).
      retryTimer = window.setTimeout(() => void refresh(), 600)
      return
    }
    const value = namespaceValueOf(response.namespaces, 'looklook') as LooklookSettingsView | undefined
    store.set({
      status: 'ready',
      enabled: value?.enabled !== false,
    })
  }
  const update = async (patch: Record<string, boolean>): Promise<void> => {
    await api.update('looklook', patch)
    void refresh()
  }
  return {
    store,
    load: () => {
      // Clear any pending retry from a previous load() call so we don't
      // stack timers when load() is called multiple times.
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      void refresh()
    },
    setEnabled: (next) => { void update({ enabled: next }) },
  }
}