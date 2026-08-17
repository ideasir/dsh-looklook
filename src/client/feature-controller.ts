/**
 * Plugin master-switch controller: reads the `looklook` settings namespace
 * (`enabled`) through the wire settings API. One switch controls the whole
 * plugin — ON (default) = every capability enabled; OFF = plugin dormant and
 * DSH behaves as without it.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
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
export function createFeatureController(api: IApiClient): FeatureController {
  const store = createSnapshotStore<FeatureState>({ status: 'loading' })
  const refresh = async (): Promise<void> => {
    const response = await api.settings.describe({})
    if (!response.result.ok) {
      store.set({ status: 'ready', enabled: true })
      return
    }
    const value = namespaceValueOf(response.result.value.namespaces, 'looklook') as LooklookSettingsView | undefined
    store.set({
      status: 'ready',
      enabled: value?.enabled !== false,
    })
  }
  const update = async (patch: Record<string, boolean>): Promise<void> => {
    await api.settings.update({ ns: 'looklook', patch })
    void refresh()
  }
  return {
    store,
    load: () => { void refresh() },
    setEnabled: (next) => { void update({ enabled: next }) },
  }
}
