/** Shared client helpers for reading plugin settings namespaces over the wire. */

/**
 * Find one namespace entry in a settings `describe()` result and return its
 * value, or undefined when absent.
 * @param namespaces - the wire `namespaces` array from `api.settings.describe`.
 * @param ns - the namespace name to look up (e.g. 'vision', 'looklook').
 */
export function namespaceValueOf(namespaces: unknown, ns: string): unknown {
  if (!Array.isArray(namespaces)) return undefined
  const entry = namespaces.find(namespace => (
    typeof namespace === 'object' && namespace !== null
    && (namespace as { ns?: unknown }).ns === ns
  ))
  const value = entry !== undefined ? (entry as { value?: unknown }).value : undefined
  return typeof value === 'object' && value !== null ? value : undefined
}
