/**
 * dsh-looklook client face: the "Look Look 功能" master-switch settings
 * section, the (conditionally visible) "视觉模型" settings section, the
 * per-session eye toggle, and the composer "上传文件" control.
 *
 * All settings go through the existing wire settings API (no new RPCs); the
 * host face (src/index.ts) consumes the same namespaces at request time.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type LookLookKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-looklook copy (settings page + eye toggle + upload). */
        looklook: LookLookKey;
    }
}
/** Required services: slots (registration), locale (copy), connection (wire API), remote (pushed invalidations), sessions (per-session scoping). */
export declare const inject: string[];
/**
 * Client plugin body: register the master-switch settings section, the
 * (multimodal-gated) vision settings section, the composer eye toggle, and
 * the composer upload control.
 */
export declare function apply(ctx: ClientContext): void;
