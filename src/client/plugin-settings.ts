export interface PluginSettingsClient {
  describe(): Promise<{ ok: true; namespaces: Array<{ ns: string; value: unknown }> } | { ok: false; error: string }>
  subscribe(listener: () => void): () => void
  update(ns: string, patch: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string }>
  describeCredentials(refs: string[]): Promise<{ ok: true; credentials: Record<string, { configured: boolean; writable: boolean }> } | { ok: false; error: string }>
  setCredential(ref: string, value: string): Promise<{ ok: true } | { ok: false; error: string }>
}
