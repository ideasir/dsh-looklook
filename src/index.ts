/**
 * dsh-looklook — vision-assist for text-only conversation models.
 *
 * Host plugin. Answers the gateway's `prompt/image-admission` decision point
 * (admits images regardless of the selected model's declared modalities) and
 * rewrites model requests at the `agent/request-messages` waterfall:
 *
 * - eye off (per-session `vision.sessionOverrides`): images become the
 *   「没有开启多模态功能」placeholder, so a text-only model never sees raw
 *   image bytes and never errors;
 * - eye on + model declares image input: pass-through — the model's own
 *   multimodal capability is used;
 * - eye on + model is text-only: every image is described by the configured
 *   vision provider (primary, then fallbacks) and replaced with the text.
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
import { replaceImagesWithPlaceholder, translateImages } from './translate.ts'
import { LooklookRemoteService } from './remote.ts'
import type {} from './types.ts'

export { Config } from './settings.ts'
export type { VisionProviderConfig, VisionSettings, VisionScope } from './settings.ts'
export { describeResultText, PLACEHOLDER_TEXT } from './translate.ts'
export type { DescribeImageInput, DescribeResult } from './vision-client.ts'
export { describeImages, statusMessage } from './vision-client.ts'
export type { ImageAdmissionDecision, ImageAdmissionPayload, VisionDescribeEvent, VisionErrorCode } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook'

/** Required services: settings (config + eye state), llm (model capability), sessions (cache log), attachments (image bytes), credentials (API keys). */
export const inject = ['settings', 'llm', 'sessions', 'attachments', 'credentials']

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
      // Eye off: strip images to the placeholder; the model sees text only.
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
    // Eye on + text-only model: describe images via the vision provider.
    const rewritten = await translateImages(
      ctx,
      decision.messages,
      sessionId,
      scope,
      signal,
    )
    return { ...decision, messages: rewritten as UserMessage[] }
  })

  ctx.on('agent/request-messages', async (_payload, request, next) => {
    if (!requestHasImage(request)) return next()

    const eye = eyeStateFor(scope, request.sessionId)
    if (eye === 'off') {
      // Eye off: strip images to the placeholder; the model sees text only.
      return { ...request, messages: replaceImagesWithPlaceholder(request.messages) }
    }

    // Eye on: use the conversation model's own multimodal capability when it
    // declares image input; unknown capability passes through untouched so a
    // multimodal model is never degraded by this plugin.
    const info = await ctx.llm.resolveModelInfo(request.provider, request.model, request.signal)
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
      return next()
    }

    // Eye on + text-only model: describe images via the vision provider.
    const messages = await translateImages(
      ctx,
      request.messages,
      request.sessionId,
      scope,
      request.signal,
    )
    return { ...request, messages }
  })
}
