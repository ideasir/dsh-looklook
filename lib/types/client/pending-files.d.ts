/**
 * Pending-file draft store: files dropped into the dialog are uploaded
 * immediately (path known) and held here until the user presses Enter, when
 * their path notes are merged into the outgoing message — exactly like image
 * attachments (chip in the input, removable, sent with the request).
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** One staged file awaiting send. */
export interface PendingFile {
    name: string;
    path: string;
    size: number;
}
export type PendingFilesState = Record<string, PendingFile[]>;
/** Per-plugin store: sessionId → staged files. */
export interface PendingFilesController {
    store: SnapshotStore<PendingFilesState>;
    add(sessionId: string, file: PendingFile): void;
    remove(sessionId: string, index: number): void;
    clear(sessionId: string): void;
    get(sessionId: string): PendingFile[];
}
/** Create the pending-files controller. */
export declare function createPendingFilesController(): PendingFilesController;
