/**
 * Host receiver for the client's model-discovery RPC (`remote.looklook`).
 * `listModels` probes an OpenAI-compatible `/models` endpoint with the
 * provider's stored credential, so the settings page can verify an API key
 * and offer the model list without a separate "test connection" step.
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** One model-discovery outcome, returned over the wire as lossless JSON. */
export type LooklookListModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string }

/** Credential-bearing fetch: fail before following any redirect. */
/** Fail before following any redirect. The signal is created per call: an
 * `AbortSignal.timeout()` starts its timer at creation, so a module-level
 * signal is permanently aborted ten seconds after load. */
const FETCH_REDIRECT = 'error' as const

/**
 * Host service answering `remote.looklook.listModels`. Extends
 * `TypertRemoteService` so the gateway's source-mode discovery sees the
 * binding (`ctx.looklookRemote` ← wire namespace `looklook`); the client
 * mounts the matching descriptor.
 */
export class LooklookRemoteService extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'looklookRemote', { namespace: 'looklook' })
  }

  /**
   * Probe one provider's `/models` endpoint. Uses the just-typed key when the
   * caller passes one (the settings editor has not saved yet); otherwise reads
   * the stored credential for the reference.
   * @param provider - the provider's endpoint, credential reference, and an
   *   optional just-typed key that takes precedence over storage.
   * @returns the model id list, or a classified failure.
   */
  @Remote
  async listModels(provider: {
    baseURL: string
    apiKeyEnv: string
    apiKey?: string
  }): Promise<LooklookListModelsResult> {
    let key = provider.apiKey
    if (key === undefined || key.length === 0) {
      const credentials = this.ctx.get('credentials')
      key = credentials === undefined
        ? undefined
        : (await credentials.resolve(credentialRef(provider.apiKeyEnv)))?.value
    }
    if (key === undefined || key.length === 0) {
      return { ok: false, error: '请先填写 API Key' }
    }
    try {
      const url = `${provider.baseURL.trim().replace(/\/+$/, '')}/models`
      const response = await fetch(url, {
        redirect: FETCH_REDIRECT,
        // Fresh per call: an AbortSignal.timeout starts ticking at creation.
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${key}` },
      })
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}` }
      }
      const payload = await response.json() as { data?: Array<{ id?: string }> }
      const models = (payload.data ?? [])
        .map(item => item.id)
        .filter((id): id is string => typeof id === 'string')
      return { ok: true, models }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
