/**
 * Plugin feature controller: reads the `looklook` settings namespace
 * (imageRecognition / videoRecognition master switches) through the wire
 * settings API.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import { namespaceValueOf } from './settings-view.ts'

/** Feature-switch state. */
export type FeatureState =
  | { status: 'loading' }
  | { status: 'ready'; imageRecognition: boolean; videoRecognition: boolean }

/** The `looklook` settings namespace value as read through the wire. */
interface LooklookSettingsView {
  imageRecognition?: boolean
  videoRecognition?: boolean
}

/** Plugin feature controller: one store + load + update. */
export interface FeatureController {
  store: SnapshotStore<FeatureState>
  load(): void
  setImageRecognition(next: boolean): void
  setVideoRecognition(next: boolean): void
}

/** Create the plugin feature controller. */
export function createFeatureController(api: IApiClient): FeatureController {
  const store = createSnapshotStore<FeatureState>({ status: 'loading' })
  const refresh = async (): Promise<void> => {
    const response = await api.settings.describe({})
    if (!response.result.ok) {
      store.set({ status: 'ready', imageRecognition: true, videoRecognition: true })
      return
    }
    const value = namespaceValueOf(response.result.value.namespaces, 'looklook') as LooklookSettingsView | undefined
    store.set({
      status: 'ready',
      imageRecognition: value?.imageRecognition !== false,
      videoRecognition: value?.videoRecognition !== false,
    })
  }
  const update = async (patch: Record<string, boolean>): Promise<void> => {
    await api.settings.update({ ns: 'looklook', patch })
    void refresh()
  }
  return {
    store,
    load: () => { void refresh() },
    setImageRecognition: (next) => { void update({ imageRecognition: next }) },
    setVideoRecognition: (next) => { void update({ videoRecognition: next }) },
  }
}
