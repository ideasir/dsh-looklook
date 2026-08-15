/**
 * OpenAI-compatible vision client: one chat-completions call per describe
 * request, primary-then-fallback provider failover, classified errors, and
 * credential-safe transport (redirects are rejected, never followed).
 */

import { Buffer } from 'node:buffer'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { VisionProviderConfig } from './settings.ts'
import type { VisionErrorCode } from './types.ts'

/** One image to describe, as raw bytes the vision endpoint can read. */
export interface DescribeImageInput {
  mediaType: ImageMediaType
  data: Uint8Array
}

/** A successful recognition result. */
export interface DescribeSuccess {
  ok: true
  text: string
  provider: string
  model: string
  /** The primary provider that failed when a fallback produced this result. */
  degradedFrom?: string
}

/** A classified failure after every enabled provider was tried. */
export interface DescribeFailure {
  ok: false
  code: VisionErrorCode
  /** The human-readable Chinese reason for the last failure. */
  message: string
  provider: string
  model: string
}

export type DescribeResult = DescribeSuccess | DescribeFailure

/** The vision model's system instruction: answer the given question about the image. */
const SYSTEM_PROMPT = '你是一个图像识别助手。请仔细观察图片，针对用户给出的问题给出准确、简洁的回答。用户问什么就答什么（例如问人数就答人数，问季节就答季节，要求全量描述才做全量描述）。只输出回答内容本身，不要输出任何额外说明。'

/** Classify an HTTP status into a stable error code. */
function classifyStatus(status: number): VisionErrorCode {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'model-not-found'
  if (status === 429) return 'rate-limited'
  if (status >= 400 && status < 500) return 'invalid-request'
  return 'network'
}

/** One failure observed for one provider, kept for the final report. */
interface ProviderFailure {
  ok: false
  code: VisionErrorCode
  message: string
  provider: string
  model: string
}

/**
 * Resolve a provider's base URL to the chat-completions endpoint.
 * Accepts either a full endpoint (`.../chat/completions`) or a base URL.
 */
export function chatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

/** Run one describe request against one provider. */
async function describeOnce(
  provider: VisionProviderConfig,
  apiKey: string,
  images: readonly DescribeImageInput[],
  maxDescribeChars: number,
  signal: AbortSignal,
  question: string,
): Promise<{ ok: true; text: string } | ProviderFailure> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('vision timeout')), provider.timeoutMs ?? 30_000)
  const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
  try {
    const parts = [
      { type: 'text', text: SYSTEM_PROMPT },
      { type: 'text', text: question },
      ...images.map(image => ({
        type: 'image_url',
        image_url: { url: `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}` },
      })),
    ]
    const response = await fetch(chatCompletionsUrl(provider.baseURL), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      // Credential-bearing request: fail before following any redirect.
      redirect: 'error',
      signal: upstream,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: parts }],
        max_tokens: Math.min(maxDescribeChars, 2048),
      }),
    })
    if (!response.ok) {
      const code = classifyStatus(response.status)
      return {
        ok: false,
        code,
        message: statusMessage(code, provider.model),
        provider: provider.id,
        model: provider.model,
      }
    }
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = payload.choices?.[0]?.message?.content
    const text = typeof content === 'string' ? content.trim() : ''
    if (text.length === 0) {
      return {
        ok: false,
        code: 'invalid-request',
        message: '视觉模型返回了空内容',
        provider: provider.id,
        model: provider.model,
      }
    }
    return { ok: true, text }
  } catch (error) {
    const aborted = upstream.aborted && !signal.aborted
    return {
      ok: false,
      code: aborted ? 'timeout' : 'network',
      message: aborted
        ? '请求超时，可到设置页增大超时时间'
        : '无法连接视觉模型服务，请检查 URL 或网络',
      provider: provider.id,
      model: provider.model,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Map a classified code to the canonical Chinese user copy. */
export function statusMessage(code: VisionErrorCode, model: string): string {
  switch (code) {
    case 'unauthorized': return 'API Key 无效或已失效'
    case 'forbidden': return 'API Key 无权限或已过期'
    case 'model-not-found': return '模型不存在，或 URL/模型名配置错误'
    case 'invalid-request': return '请求参数错误——该模型可能不支持图像输入'
    case 'rate-limited': return '请求过于频繁或配额已用完'
    case 'timeout': return '请求超时，可到设置页增大超时时间'
    case 'network': return '无法连接视觉模型服务，请检查 URL 或网络'
    case 'unconfigured': return '未配置视觉模型，请到「设置 → 视觉模型」添加'
    default: return `识别失败（${model}）`
  }
}

/**
 * Describe the given images with the first healthy enabled provider; a
 * provider failure fails over to the next. Returns the first success, or a
 * classified failure after every provider was tried.
 */
export async function describeImages(
  providers: readonly VisionProviderConfig[],
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  images: readonly DescribeImageInput[],
  maxDescribeChars: number,
  signal: AbortSignal,
  question = '请详细描述这张图片的内容。',
): Promise<DescribeResult> {
  if (providers.length === 0) {
    return {
      ok: false,
      code: 'unconfigured',
      message: statusMessage('unconfigured', ''),
      provider: '',
      model: '',
    }
  }
  const failures: ProviderFailure[] = []
  for (const provider of providers) {
    const apiKey = await resolveApiKey(provider.apiKeyEnv)
    if (apiKey === undefined) {
      failures.push({
        ok: false,
        code: 'unauthorized',
        message: 'API Key 无效或已失效（未配置）',
        provider: provider.id,
        model: provider.model,
      })
      continue
    }
    const result = await describeOnce(provider, apiKey, images, maxDescribeChars, signal, question)
    if (result.ok) {
      const degradedFrom = failures[0]?.provider
      return {
        ok: true,
        text: result.text.slice(0, maxDescribeChars),
        provider: provider.id,
        model: provider.model,
        ...degradedFrom === undefined ? {} : { degradedFrom },
      }
    }
    failures.push(result)
    if (signal.aborted) break
  }
  const last = failures[failures.length - 1] ?? {
    ok: false as const,
    code: 'network' as const,
    message: '无法连接视觉模型服务，请检查 URL 或网络',
    provider: '',
    model: '',
  }
  return { ok: false, code: last.code, message: last.message, provider: last.provider, model: last.model }
}
