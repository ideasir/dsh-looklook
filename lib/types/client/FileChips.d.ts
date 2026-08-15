/**
 * FileChips: pending archive/video attachments rendered in the composer dock
 * — one chip per staged file (icon + name + size), a delete × on hover.
 * The files are already uploaded; pressing Enter merges their path notes into
 * the outgoing message (the submit wrapper in index.ts).
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { PendingFilesController, PendingFilesState } from './pending-files.ts';
/** Injected face supplied by the plugin apply closure. */
export interface FileChipsInjected {
    /** Bound translate for the `looklook` namespace. */
    t: TranslateNS<'looklook'>;
    /** Pending-files controller. */
    pending: PendingFilesController;
    /** Reactive snapshot of the pending store. */
    usePending: (selector: (state: PendingFilesState) => unknown) => unknown;
    /** The current session id (injected by the slot owner). */
    sessionId: string;
    /** Send every pending file right now (reliable prompt path). */
    onSend: () => void;
    /** Whether a send is in flight. */
    sending: boolean;
    /** Visible send error (or null). */
    sendError: string | null;
}
/** One chip card (hover reveals the remove ×). */
export declare function FileChips(props: FileChipsInjected): import("react").JSX.Element | null;
