/**
 * Pending-file draft store: files dropped into the dialog are uploaded
 * immediately (path known) and held here until the user presses Enter, when
 * their path notes are merged into the outgoing message — exactly like image
 * attachments (chip in the input, removable, sent with the request).
 *
 * Entries carry a stable `id` so upload callbacks can address them even when
 * the user deletes another chip mid-upload (index-based addressing shifts on
 * deletion and would write the path into the wrong chip).
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** One staged file awaiting send. While `uploading` is true, `path` is unset. */
export interface PendingFile {
  /** Stable per-entry id (never shifts when sibling chips are deleted). */
  id: string
  name: string
  path?: string
  size: number
  /** Whether the file is still uploading. */
  uploading?: boolean
  /** Upload progress 0–100. */
  progress?: number
  /** Upload failure message (chip shows an error state). */
  error?: string
}

export type PendingFilesState = Record<string, PendingFile[]>

/** Per-plugin store: sessionId → staged files. */
export interface PendingFilesController {
  store: SnapshotStore<PendingFilesState>
  add(sessionId: string, file: Omit<PendingFile, 'id'>): void
  updateById(sessionId: string, id: string, patch: Partial<PendingFile>): void
  remove(sessionId: string, id: string): void
  clear(sessionId: string): void
  get(sessionId: string): PendingFile[]
}

/** Create the pending-files controller. */
export function createPendingFilesController(): PendingFilesController {
  const store = createSnapshotStore<PendingFilesState>({})
  const get = (sessionId: string): PendingFile[] => store.getSnapshot()[sessionId] ?? []
  let seq = 0
  return {
    store,
    add: (sessionId, file) => {
      const id = `f${Date.now().toString(36)}_${(seq++).toString(36)}`
      store.set({ ...store.getSnapshot(), [sessionId]: [...get(sessionId), { ...file, id }] })
    },
    updateById: (sessionId, id, patch) => {
      const list = get(sessionId)
      if (!list.some(item => item.id === id)) return
      const next = list.map(item => item.id === id ? { ...item, ...patch } : item)
      store.set({ ...store.getSnapshot(), [sessionId]: next })
    },
    remove: (sessionId, id) => {
      const next = get(sessionId).filter(item => item.id !== id)
      const state = { ...store.getSnapshot() }
      if (next.length > 0) {
        state[sessionId] = next
      } else {
        delete state[sessionId]
      }
      store.set(state)
    },
    clear: (sessionId) => {
      store.set({ ...store.getSnapshot(), ...{ [sessionId]: [] } })
    },
    get,
  }
}
