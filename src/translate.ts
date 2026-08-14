/**
 * Image → text translation for text-only conversation models, and the
 * eye-off placeholder path. Translation results are cached in the session log
 * as `vision/describe` events (keyed by attachment id), so the same image is
 * recognized once and replayed from the log on later requests.
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { contentHasImage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, ImageBlock, Message } from '@deepseek-ai/dsh-llm'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { VisionScope } from './settings.ts'
import { describeImages, statusMessage, type DescribeResult } from './vision-client.ts'
import type { VisionDescribeEvent } from './types.ts'

/** The text the conversation model receives for an image while the eye is off. */
export const PLACEHOLDER_TEXT = '[图片已省略]\n没有开启多模态功能'

/** Compose the model-visible text for one recognition result (all Chinese). */
export function describeResultText(result: DescribeResult): string {
  if (result.ok) {
    const base = `【图片识别 · ${result.model}】\n${result.text}`
    if (result.degradedFrom !== undefined) {
      return `${base}\n\n⚠️ 提示：视觉模型「${result.degradedFrom}」不可用，本次已自动切换为「${result.model}」完成识别。`
    }
    return base
  }
  const model = result.model.length > 0 ? result.model : '未配置'
  return `【图片识别失败】\n原因：${result.message}\n涉及模型：${model}\n请到「设置 → 视觉模型」检查配置后重试。`
}

/** Replace every image block (including nested tool-result content) with one text block. */
function rewriteContent(
  blocks: readonly ContentBlock[],
  textFor: (image: ImageBlock) => string,
): ContentBlock[] {
  const out: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      out.push({ type: 'text', text: textFor(block) })
    } else if (block.type === 'tool-result') {
      out.push({ ...block, content: rewriteContent(block.content, textFor) })
    } else {
      out.push(block)
    }
  }
  return out
}

function messagesHaveImage(messages: readonly Message[]): boolean {
  return messages.some(message => contentHasImage(message.content))
}

/** Eye-off path: images become the placeholder; nothing else changes. */
export function replaceImagesWithPlaceholder(messages: readonly Message[]): Message[] {
  if (!messagesHaveImage(messages)) return messages as Message[]
  return messages.map(message => (
    contentHasImage(message.content)
      ? { ...message, content: rewriteContent(message.content, () => PLACEHOLDER_TEXT) }
      : message
  ))
}

/** Read the recognition cache for one session from its logged `vision/describe` events. */
function cachedDescriptions(session: Session): Map<string, VisionDescribeEvent> {
  const cache = new Map<string, VisionDescribeEvent>()
  for (const event of session.events) {
    if (event.type !== 'vision/describe') continue
    const record = event.data as VisionDescribeEvent
    if (record.ok && record.text !== undefined) cache.set(record.attachmentId, record)
  }
  return cache
}

/**
 * Record one recognition outcome in the session log. The `{ ignorable: true }`
 * option is the out-of-repo plugin event channel (upstream `Session.append`
 * addition); the runtime check on the returned event catches a build that
 * does not support it, so the plugin degrades to in-memory caching instead of
 * persisting an event an older reader would refuse.
 */
function recordDescribe(
  ctx: Context,
  sessionId: SessionId | undefined,
  data: VisionDescribeEvent,
): void {
  if (sessionId === undefined) return
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = (session.append as any)('vision/describe', data, { ignorable: true })
  if (event.ignorable !== true) {
    ctx.logger.warn(
      'dsh-looklook: this DSH build does not persist plugin events (ignorable append unsupported); recognition cache lives in memory only — apply the compatibility patch or upgrade DSH',
    )
  }
}

/** Eye-on, text-only path: describe every image and replace it with the result text. */
export async function translateImages(
  ctx: Context,
  messages: readonly Message[],
  sessionId: SessionId | undefined,
  scope: VisionScope,
  signal: AbortSignal | undefined,
): Promise<Message[]> {
  const session = sessionId === undefined ? undefined : ctx.sessions.get(sessionId)
  const cache = session === undefined ? new Map<string, VisionDescribeEvent>() : cachedDescriptions(session)
  const providers = scope.get().providers.filter(provider => provider.enabled !== false)
  const maxChars = scope.get().maxDescribeChars
  const resolveApiKey = async (ref: string): Promise<string | undefined> => {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) return undefined
    const resolved = await credentials.resolve(credentialRef(ref))
    return resolved?.value
  }

  const textFor = async (image: ImageBlock): Promise<string> => {
    const cached = cache.get(String(image.attachment.attachmentId))
    if (cached !== undefined && cached.text !== undefined) return cached.text
    const stored = await ctx.attachments.readImage(image.attachment, signal)
    const result = await describeImages(providers, resolveApiKey, [{
      mediaType: stored.ref.mediaType,
      data: stored.data,
    }], maxChars, signal ?? new AbortController().signal)
    const text = describeResultText(result)
    recordDescribe(ctx, sessionId, {
      attachmentId: String(image.attachment.attachmentId),
      provider: result.provider,
      model: result.model,
      ok: result.ok,
      ...result.ok ? {} : { error: { code: result.code } },
      text,
      ...result.ok && result.degradedFrom !== undefined ? { degradedFrom: result.degradedFrom } : {},
    })
    return text
  }

  const out: Message[] = []
  for (const message of messages) {
    if (!contentHasImage(message.content)) {
      out.push(message)
      continue
    }
    out.push({
      ...message,
      content: await rewriteContentAsync(message.content, textFor),
    })
  }
  return out
}

/** Async variant of {@link rewriteContent} for the recognition path. */
async function rewriteContentAsync(
  blocks: readonly ContentBlock[],
  textFor: (image: ImageBlock) => Promise<string>,
): Promise<ContentBlock[]> {
  const out: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      out.push({ type: 'text', text: await textFor(block) })
    } else if (block.type === 'tool-result') {
      out.push({ ...block, content: await rewriteContentAsync(block.content, textFor) })
    } else {
      out.push(block)
    }
  }
  return out
}

export { statusMessage }
