/**
 * Plugin feature controller: reads the `looklook` settings namespace
 * (multimodal / zip master switches) through the wire settings API and
 * reports the 7z install state via the plugin's HTTP routes.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { namespaceValueOf } from './settings-view.ts'

/** Feature-switch state. */
export type FeatureState =
  | { status: 'loading' }
  | { status: 'ready'; multimodal: boolean; moreExtensions: boolean }

/** The `looklook` settings namespace value as read through the wire. */
interface LooklookSettingsView {
  multimodal?: boolean
  moreExtensions?: boolean
}

/** Plugin feature controller: one store + load + update. */
export interface FeatureController {
  store: SnapshotStore<FeatureState>
  load(): void
  setMultimodal(next: boolean): void
  setMoreExtensions(next: boolean): void
}

/** Create the plugin feature controller. */
export function createFeatureController(api: IApiClient): FeatureController {
  const store = createSnapshotStore<FeatureState>({ status: 'loading' })
  const refresh = async (): Promise<void> => {
    const response = await api.settings.describe({})
    if (!response.result.ok) {
      store.set({ status: 'ready', multimodal: true, moreExtensions: true })
      return
    }
    const value = namespaceValueOf(response.result.value.namespaces, 'looklook') as LooklookSettingsView | undefined
    store.set({
      status: 'ready',
      multimodal: value?.multimodal !== false,
      moreExtensions: value?.moreExtensions !== false,
    })
  }
  const update = async (patch: Record<string, boolean>): Promise<void> => {
    await api.settings.update({ ns: 'looklook', patch })
    void refresh()
  }
  return {
    store,
    load: () => { void refresh() },
    setMultimodal: (next) => { void update({ multimodal: next }) },
    setMoreExtensions: (next) => { void update({ moreExtensions: next }) },
  }
}
