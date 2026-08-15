/**
 * dsh-looklook client face:
 * - the looklook entry inside the Plugins settings section (master switches +
 *   conditional vision-model config);
 * - drag-and-drop of archive/video files straight into the dialog;
 * - the per-session eye toggle and the original-image message view.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type LookLookKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-looklook copy (settings page + eye toggle + upload). */
        looklook: LookLookKey;
    }
}
/** Required services: slots, locale, connection, remote, sessions. */
export declare const inject: string[];
/**
 * Client plugin body: register the looklook Plugins-settings tab, the
 * composer upload control, drag-and-drop of archive/video files, the eye
 * toggle, and the original-image message view.
 */
export declare function apply(ctx: ClientContext): void;
