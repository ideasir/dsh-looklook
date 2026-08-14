/**
 * dsh-looklook client face: the "视觉模型" settings section and the per-session
 * eye toggle in the composer tool row.
 *
 * The eye toggle reads/writes the `vision` settings namespace through the
 * existing wire settings API (no new RPCs); the host face (src/index.ts)
 * consumes the same namespace at request time.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type LookLookKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-looklook copy (settings page + eye toggle). */
        looklook: LookLookKey;
    }
}
/** Required services: slots (registration), locale (copy), connection (wire API), remote (pushed invalidations), sessions (per-session scoping). */
export declare const inject: string[];
/**
 * Client plugin body: register the settings section and the composer eye
 * toggle. Each session gets its own eye controller (lazy map); pushed
 * settings invalidations refresh every loaded controller.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
