/**
 * dsh-looklook — vision-assist for text-only conversation models.
 *
 * Host plugin. Answers the gateway's `prompt/image-admission` decision point
 * (admits images regardless of the selected model's declared modalities) and
 * rewrites model requests (rc.6: `agent/pre-step`; newer: `agent/request-messages`):
 *
 * - eye off (per-session `vision.sessionOverrides`): images become the
 *   「没有开启多模态功能」placeholder, so a text-only model never sees raw
 *   image bytes and never errors;
 * - eye on + model declares image input: pass-through — the model's own
 *   multimodal capability is used;
 * - eye on + model is text-only: every image becomes a machine-readable
 *   image reference; the main model calls the looklook_describe tool to
 *   "see" the image (asking whatever question the user's request implies —
 *   pseudo-native multimodal, no hardcoded description rules).
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespace, the event listeners, and every disposer.
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { contentHasImage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session/types'
import { Config, eyeStateFor, type VisionSettings, type VisionScope } from './settings.ts'
import { replaceImagesWithPlaceholder, rewriteImagesToToolReferences } from './translate.ts'
import { registerDescribeTool } from './describe-tool.ts'
import { LooklookRemoteService } from './remote.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {} from './types.ts'

export { Config } from './settings.ts'
export type { VisionProviderConfig, VisionSettings, VisionScope } from './settings.ts'
export { PLACEHOLDER_TEXT } from './translate.ts'
export type { DescribeImageInput, DescribeResult } from './vision-client.ts'
export { describeImages, statusMessage } from './vision-client.ts'
export type { ImageAdmissionDecision, ImageAdmissionPayload, VisionDescribeEvent, VisionErrorCode } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook'

/** Required services: settings (config + eye state), llm (model capability), sessions, attachments (image bytes), credentials (API keys), tools (looklook_describe), systemPrompt (tool guidance). */
export const inject = ['settings', 'llm', 'sessions', 'attachments', 'credentials', 'tools', 'systemPrompt']

/** Recognize whether any message in the request carries image content. */
function requestHasImage(options: GenerateOptions): boolean {
  return options.messages.some(message => contentHasImage(message.content))
}

/**
 * Plugin body: register the `vision` settings namespace, answer the image
 * admission decision point, and rewrite model requests at the
 * `agent/request-messages` waterfall.
 * @param ctx - host context.
 * @param config - composition-base configuration (the user settings layer
 *   overrides it live).
 */
export function apply(ctx: Context, config: VisionSettings): void {
  const scope: VisionScope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config })

  // Host receiver for the client's model-discovery RPC (settings page).
  ctx.plugin(LooklookRemoteService)

  // Exact image references as they arrive (attachmentId → full ref), so the
  // describe tool can read images by the reference the user message carries.
  const refRegistry = new Map<string, ImageAttachmentRef>()

  // The "eyes" of the pseudo-native multimodal model: the main model asks
  // this tool whatever question the user's request implies.
  registerDescribeTool(ctx, scope, refRegistry)

  // Tell the main model how to see images.
  ctx.systemPrompt.section({
    name: 'looklook:vision',
    order: 200,
    text: '用户消息中的图片内容对你不可见。当需要了解用户图片的内容时，必须调用 looklook_describe 工具：把用户消息中的图片引用原样填入 image_ref，并根据用户的实际问题决定 question 的内容（用户问什么就针对性地问什么，不要一律要求全量描述）。',
  })

  // rc.6 admission override: the api-proxy's hardcoded text-only refusal
  // consults this optional service (patched into dsh-host-apiproxy). This
  // plugin services images downstream (translation or the placeholder), so
  // the answer is always "allow" while mounted.
  ctx.provide('imageAdmission', {
    decide: () => 'allow' as const,
  })

  // The gateway asks before admitting an image while the selected model is
  // text-only. This plugin services the image downstream (translation or the
  // placeholder), so the answer is always "allow" while mounted.
  ctx.on('prompt/image-admission', () => 'allow')

  // rc.6 request rewriting: `agent/request-messages` and `llm/stream`'s
  // argument are both frozen in this release — `llm/stream` cannot replace the
  // request and the session log is built from `agent/pre-step`'s decision.
  // Rewriting here is the only seam that changes what a text-only model sees
  // (the log then carries the rewritten text instead of the raw image; newer
  // harnesses restore the request-only rewrite via agent/request-messages).
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    if (!messages.some(message => contentHasImage(message.content))) return next()
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const sessionId = String(agent.session.id) as SessionId
    const eye = eyeStateFor(scope, sessionId)
    if (eye === 'off') {
      // Eye off: strip images to the placeholder; the original image still
      // shows in the chat via the attachment marker.
      return {
        ...decision,
        messages: replaceImagesWithPlaceholder(decision.messages) as UserMessage[],
      }
    }
    // Eye on: use the conversation model's own multimodal capability when it
    // declares image input; unknown capability passes through untouched so a
    // multimodal model is never degraded by this plugin.
    const info = await ctx.llm.resolveModelInfo(agent.options.provider ?? '', agent.options.model ?? '', signal)
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
      return decision
    }
    // Eye on + text-only model: turn images into tool references (fast —
    // no vision call, so the message appears in the chat immediately; the
    // main model calls looklook_describe when it needs to see the image).
    const rewritten = rewriteImagesToToolReferences(decision.messages, refRegistry)
    return { ...decision, messages: rewritten as UserMessage[] }
  })

  ctx.on('agent/request-messages', async (_payload, request, next) => {
    if (!requestHasImage(request)) return next()

    const eye = eyeStateFor(scope, request.sessionId)
    if (eye === 'off') {
      // Eye off: strip images to the placeholder; the original image still
      // shows in the chat via the attachment marker.
      return { ...request, messages: replaceImagesWithPlaceholder(request.messages) }
    }

    // Eye on: use the conversation model's own multimodal capability when it
    // declares image input; unknown capability passes through untouched so a
    // multimodal model is never degraded by this plugin.
    const info = await ctx.llm.resolveModelInfo(request.provider, request.model, request.signal)
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
      return next()
    }

    // Eye on + text-only model: turn images into tool references (fast).
    const messages = rewriteImagesToToolReferences(request.messages, refRegistry)
    return { ...request, messages }
  })
}
