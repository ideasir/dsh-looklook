/**
 * looklook_describe — the tool that makes a text-only model "pseudo-native
 * multimodal". The MAIN MODEL decides what to ask the vision model: it passes
 * an image reference (from the user message) plus whatever question it judges
 * appropriate for the user's request (targeted question or full description).
 * No hardcoded rules about what the vision model must output.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { VisionScope } from './settings.ts'
import { describeImages } from './vision-client.ts'

/**
 * Resolve the image_ref argument: prefer the exact reference recorded when
 * the image arrived (registry), then the model-supplied JSON fields.
 */
function resolveRef(
  raw: string,
  registry: ReadonlyMap<string, ImageAttachmentRef>,
): { ref: ImageAttachmentRef } | { error: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { error: 'image_ref 为空' }
  // 1) Try JSON reference (what the user message carries).
  try {
    const parsed = JSON.parse(trimmed) as Partial<ImageAttachmentRef>
    if (typeof parsed?.attachmentId === 'string' && parsed.attachmentId.length > 0) {
      const exact = registry.get(parsed.attachmentId)
      if (exact !== undefined) return { ref: exact }
      if (
        typeof parsed.mediaType === 'string'
        && typeof parsed.bytes === 'number'
        && typeof parsed.width === 'number'
        && typeof parsed.height === 'number'
      ) {
        return {
          ref: {
            attachmentId: parsed.attachmentId,
            mediaType: parsed.mediaType as ImageAttachmentRef['mediaType'],
            bytes: parsed.bytes,
            width: parsed.width,
            height: parsed.height,
          },
        }
      }
    }
  } catch {
    /* not JSON — fall through to bare-id lookup */
  }
  // 2) Bare attachmentId lookup.
  const byId = registry.get(trimmed)
  if (byId !== undefined) return { ref: byId }
  return { error: '无法解析图片引用（image_ref 无效，或该图片已不在本会话的可用范围）' }
}

/** Register the describe tool; refRegistry is populated as images arrive. */
export function registerDescribeTool(
  ctx: Context,
  scope: VisionScope,
  refRegistry: Map<string, ImageAttachmentRef>,
): void {
  ctx.tools.register(defineTool({
    name: 'looklook_describe',
    description: '查看用户发送的一张图片并回答关于它的问题。图片内容对模型不可见，调用本工具是"看到"图片的唯一方式。image_ref 填用户消息中的图片引用（原样复制，不要改动）；question 填你要向视觉模型询问的内容——请根据用户的问题自行判断问什么（用户问人数就问人数，用户要求全量描述才请求全量描述，不要写死规则）。',
    parameters: {
      image_ref: {
        type: 'string',
        required: true,
        description: '用户消息中的图片引用 JSON，原样复制，不要改动。',
      },
      question: {
        type: 'string',
        required: true,
        description: '你要向视觉模型询问的问题。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: {
            type: 'string',
            required: true,
          },
        },
      },
      render: (_args: unknown, value: { text: string }) => [{ type: 'text', text: value.text }],
    },
    isConcurrencySafe: () => true,
    async execute(args: { image_ref?: unknown; question?: unknown }, exec) {
      const rawRef = typeof args.image_ref === 'string' ? args.image_ref : ''
      const question = typeof args.question === 'string' && args.question.trim().length > 0
        ? args.question.trim()
        : '请详细描述这张图片的内容。'
      const resolved = resolveRef(rawRef, refRegistry)
      if ('error' in resolved) return { text: '识图失败：' + resolved.error }
      try {
        const stored = await ctx.attachments.readImage(resolved.ref, exec.signal)
        const providers = scope.get().providers.filter(provider => provider.enabled !== false)
        const maxChars = scope.get().maxDescribeChars
        const credentials = ctx.get('credentials')
        const resolveApiKey = async (ref: string): Promise<string | undefined> => {
          if (credentials === undefined) return undefined
          const resolvedCred = await credentials.resolve(credentialRef(ref))
          return resolvedCred?.value
        }
        const result = await describeImages(
          providers,
          resolveApiKey,
          [{ mediaType: stored.ref.mediaType, data: stored.data }],
          maxChars,
          exec.signal,
          question,
        )
        if (!result.ok) return { text: '识图失败：' + result.message }
        return { text: result.text }
      } catch (error) {
        return { text: '识图失败：' + (error instanceof Error ? error.message : String(error)) }
      }
    },
  }))
}
