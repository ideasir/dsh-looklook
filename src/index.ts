/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. Feature switches (settings page):
 * - 多模态 (multimodal): image vision assist for text-only models. When ON,
 *   answers `prompt/image-admission` and rewrites model requests; when OFF
 *   the plugin is invisible to images (native DSH behavior).
 * - ZIP: the `process_zip` tool (vendored from @ideasir/dsh-zip) plus the
 *   archive upload channel.
 *
 * Upload channel: the client uploads archives/video through the registered
 * `/api/looklook-upload` route into the session workspace `.uploads/` and
 * sends a user message with the file path; the model then processes the file
 * with process_zip / fs / bash.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespaces, the event listeners, the routes, and every disposer.
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { contentHasImage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import type { SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session/types'
import { Config, LooklookConfig, AudioConfig, looklookFeatures, eyeStateFor, type VisionSettings, type VisionScope, type LooklookScope, type AudioScope } from './settings.ts'
import { replaceImagesWithPlaceholder, rewriteImagesToToolReferences } from './translate.ts'
import { registerSeeTool } from './see-tool.ts'
import { registerZipTool } from './zip-tool.ts'
import { registerUploadRoutes } from './upload.ts'
import { registerAsrInstallRoutes } from './asr-install.ts'
import { LooklookRemoteService } from './remote.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type {} from './types.ts'

export { Config } from './settings.ts'
export { LooklookConfig } from './settings.ts'
export { AudioConfig } from './settings.ts'
export type { VisionProviderConfig, VisionSettings, VisionScope, LooklookSettings, LooklookScope, AudioProviderConfig, AudioSettings, AudioScope } from './settings.ts'
export { PLACEHOLDER_TEXT } from './translate.ts'
export type { DescribeImageInput, DescribeResult } from './vision-client.ts'
export { describeImages, statusMessage } from './vision-client.ts'
export type { ImageAdmissionDecision, ImageAdmissionPayload, VisionErrorCode } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook'

/** Required services: settings, llm, sessions, attachments, credentials, tools, systemPrompt, webServer. */
export const inject = ['settings', 'llm', 'sessions', 'attachments', 'credentials', 'tools', 'systemPrompt', 'webServer', 'fs']

/** Recognize whether any message in the request carries image content. */
function requestHasImage(options: GenerateOptions): boolean {
  return options.messages.some(message => contentHasImage(message.content))
}

/** One admission decision for both gateways: allow only while image recognition is ON. */
function admissionDecision(multimodalOn: boolean): 'allow' | undefined {
  return multimodalOn ? 'allow' : undefined
}

/**
 * Plugin body: register the feature toggles + vision settings namespaces,
 * answer the image admission decision point, rewrite model requests at the
 * `agent/request-messages` waterfall (when image recognition is ON), register the
 * process_zip tool (gated by the zip toggle) and the upload/7z routes.
 */
export function apply(ctx: Context, config: VisionSettings): void {
  // Feature master switches (settings page → plugin area).
  const features: LooklookScope = ctx.settings.register(settingsNamespace('looklook'), LooklookConfig, { base: undefined })
  const scope: VisionScope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config })
  // Audio model (L2+L3 merged): API providers; local ASR install state on disk.
  const audioScope: AudioScope = ctx.settings.register(settingsNamespace('looklook-audio'), AudioConfig, { base: undefined })

  const imageRecognitionEnabled = (): boolean => looklookFeatures(features).imageRecognition
  const videoRecognitionEnabled = (): boolean => looklookFeatures(features).videoRecognition

  // Host receiver for the client's model-discovery RPC (settings page).
  ctx.plugin(LooklookRemoteService)

  // Exact image references as they arrive (attachmentId → full ref), so the
  // see tool can read images by the reference the user message carries.
  const refRegistry = new Map<string, ImageAttachmentRef>()

  // The unified "look at anything" tool (image / video / zip branches).
  registerSeeTool(ctx, scope, audioScope, features, refRegistry, videoRecognitionEnabled)

  // Tell the main model how to see content and how uploads land.
  ctx.systemPrompt.section({
    name: 'looklook:vision',
    order: 200,
    text: '用户消息中的图片内容对你不可见。当需要了解用户图片的内容时，必须调用 looklook_see 工具：把用户消息中的图片引用原样填入 source，并根据用户的实际问题决定 question 的内容（用户问什么就针对性地问什么，不要一律要求全量描述）。',
  })
  ctx.systemPrompt.section({
    name: 'looklook:files',
    order: 205,
    text: '用户上传的文件（压缩包、视频等）会保存到会话工作区的 .uploads/ 目录，上传时消息里会带有文件路径。理解任何内容（图片、视频、压缩包内容）用 looklook_see 工具（source 填文件路径或链接）；解压压缩包用 process_zip 工具（extract）；处理其它文件用 bash/fs 工具。',
  })

  // rc.6 admission override: the api-proxy's hardcoded text-only refusal
  // consults this optional service (patched into dsh-host-apiproxy). Only
  // answer "allow" while the image recognition feature is ON.
  ctx.provide('imageAdmission', {
    decide: () => admissionDecision(imageRecognitionEnabled()),
  })

  // The gateway asks before admitting an image while the selected model is
  // text-only. Answer "allow" only while image recognition is ON; otherwise return
  // undefined so DSH falls back to native behavior.
  ctx.on('prompt/image-admission', () => admissionDecision(imageRecognitionEnabled()))

  // rc.6 request rewriting: `agent/pre-step` and `agent/request-messages`.
  // When image recognition is OFF the plugin does nothing to images (native).
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    if (!imageRecognitionEnabled()) return next()
    if (!messages.some(message => contentHasImage(message.content))) return next()
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const sessionId = String(agent.session.id) as SessionId
    const eye = eyeStateFor(scope, sessionId)
    if (eye === 'off') {
      return {
        ...decision,
        messages: replaceImagesWithPlaceholder(decision.messages) as UserMessage[],
      }
    }
    const info = await ctx.llm.resolveModelInfo(agent.options.provider ?? '', agent.options.model ?? '', signal)
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
      return decision
    }
    const rewritten = rewriteImagesToToolReferences(decision.messages, refRegistry)
    return { ...decision, messages: rewritten as UserMessage[] }
  })

  ctx.on('agent/request-messages', async (_payload, request, next) => {
    if (!imageRecognitionEnabled()) return next()
    if (!requestHasImage(request)) return next()

    const eye = eyeStateFor(scope, request.sessionId)
    if (eye === 'off') {
      return { ...request, messages: replaceImagesWithPlaceholder(request.messages) }
    }

    const info = await ctx.llm.resolveModelInfo(request.provider, request.model, request.signal)
    if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
      return next()
    }

    const messages = rewriteImagesToToolReferences(request.messages, refRegistry)
    return { ...request, messages }
  })

  // ZIP extraction tool (vendored from dsh-zip): extract operation only —
  // the "look at zip contents" branch lives in looklook_see.
  registerZipTool(ctx)

  // Upload channel: any file type (no whitelist — installing the plugin
  // unlocks every upload).
  registerUploadRoutes(ctx)

  // Local ASR one-click install (status + trigger routes).
  registerAsrInstallRoutes(ctx)
}
