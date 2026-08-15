/**
 * Pending-file draft store: files dropped into the dialog are uploaded
 * immediately (path known) and held here until the user presses Enter, when
 * their path notes are merged into the outgoing message — exactly like image
 * attachments (chip in the input, removable, sent with the request).
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** One staged file awaiting send. */
export interface PendingFile {
  name: string
  path: string
  size: number
}

export type PendingFilesState = Record<string, PendingFile[]>

/** Per-plugin store: sessionId → staged files. */
export interface PendingFilesController {
  store: SnapshotStore<PendingFilesState>
  add(sessionId: string, file: PendingFile): void
  remove(sessionId: string, index: number): void
  clear(sessionId: string): void
  get(sessionId: string): PendingFile[]
}

/** Create the pending-files controller. */
export function createPendingFilesController(): PendingFilesController {
  const store = createSnapshotStore<PendingFilesState>({})
  const get = (sessionId: string): PendingFile[] => store.getSnapshot()[sessionId] ?? []
  return {
    store,
    add: (sessionId, file) => {
      store.set({ ...store.getSnapshot(), [sessionId]: [...get(sessionId), file] })
    },
    remove: (sessionId, index) => {
      const next = get(sessionId).filter((_, i) => i !== index)
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
