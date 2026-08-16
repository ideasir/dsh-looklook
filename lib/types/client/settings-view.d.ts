/** Shared client helpers for reading plugin settings namespaces over the wire. */
/**
 * Find one namespace entry in a settings `describe()` result and return its
 * value, or undefined when absent.
 * @param namespaces - the wire `namespaces` array from `api.settings.describe`.
 * @param ns - the namespace name to look up (e.g. 'vision', 'looklook').
 */
export declare function namespaceValueOf(namespaces: unknown, ns: string): unknown;
