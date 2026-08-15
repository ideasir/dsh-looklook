/**
 * Plugin feature controller: reads the `looklook` settings namespace
 * (multimodal / zip master switches) through the wire settings API and
 * reports the 7z install state via the plugin's HTTP routes.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'

/** Feature-switch state. */
export type FeatureState =
  | { status: 'loading' }
  | { status: 'ready'; multimodal: boolean; moreExtensions: boolean }

/** The `looklook` settings namespace value as read through the wire. */
interface LooklookSettingsView {
  multimodal?: boolean
  moreExtensions?: boolean
}

function looklookSettingsOf(namespaces: unknown): LooklookSettingsView | undefined {
  if (!Array.isArray(namespaces)) return undefined
  const entry = namespaces.find(namespace => (
    typeof namespace === 'object' && namespace !== null
    && (namespace as { ns?: unknown }).ns === 'looklook'
  ))
  const value = entry !== undefined ? (entry as { value?: unknown }).value : undefined
  return typeof value === 'object' && value !== null ? value as LooklookSettingsView : undefined
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
    const value = looklookSettingsOf(response.result.value.namespaces)
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

/** 7z support state. */
export type SevenZState =
  | { status: 'unknown' }
  | { status: 'checking' }
  | { status: 'ready'; installed: boolean }
  | { status: 'installing' }
  | { status: 'error'; message: string }

/** Query the 7z install state through the plugin's HTTP routes. */
export async function fetchSevenZStatus(): Promise<{ installed: boolean }> {
  const response = await fetch('/api/looklook-7z-status', { method: 'GET' })
  if (!response.ok) throw new Error(`7z status HTTP ${response.status}`)
  const body = await response.json() as { ok?: boolean; installed?: boolean; error?: string }
  if (body.ok !== true) throw new Error(body.error ?? '7z 状态查询失败')
  return { installed: body.installed === true }
}

/** Trigger the 7z install through the plugin's HTTP route. */
export async function requestSevenZInstall(): Promise<{ ok: boolean; installed: boolean; output: string }> {
  const response = await fetch('/api/looklook-7z-install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (!response.ok) throw new Error(`7z install HTTP ${response.status}`)
  const body = await response.json() as { ok?: boolean; installed?: boolean; error?: string; output?: string }
  if (body.ok !== true) throw new Error(body.error ?? '7z 安装失败')
  return { ok: true, installed: body.installed === true, output: body.output ?? '' }
}
