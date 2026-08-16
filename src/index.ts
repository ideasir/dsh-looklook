/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. Feature switches (settings page):
 * - 识别图像 (imageRecognition): the plugin answers image questions for
 *   text-only conversation models. Images NEVER enter the native attachment
 *   pipeline: the client routes every dropped image through the plugin's own
 *   upload channel into the session workspace `.uploads/`, and the message
 *   the model receives carries only the file path. The api-proxy's native
 *   "model does not support image input" check is therefore never reached —
 *   no request rewriting, no admission override, no harness patch.
 * - 识别视频 (videoRecognition): video analysis (frames + audio understanding);
 *   OFF = files saved only, never analyzed.
 *
 * Settings exposure is the standard rc.6 mechanism: the `vision`,
 * `looklook`, and `looklook-audio` namespaces are declared through
 * `llm.registerConfigurableProviders()`, and dsh-host-apiproxy's
 * configuration-client boundary automatically serves every configurable
 * provider's settings namespace. No `WEB_SETTINGS_NAMESPACES` patch.
 *
 * Upload / ASR install / model discovery are Remote RPCs on the `looklook`
 * wire namespace (Typert), so they inherit the api-proxy connection
 * authorization instead of exposing unauth'd HTTP routes.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespaces, the routes, and every disposer.
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { Config, LooklookConfig, AudioConfig, looklookFeatures, type VisionSettings, type VisionScope, type LooklookScope, type AudioScope } from './settings.ts'
import { registerSeeTool } from './see-tool.ts'
import { registerZipTool } from './zip-tool.ts'
import { LooklookRemoteService } from './remote.ts'
import type {} from './types.ts'

export { Config } from './settings.ts'
export { LooklookConfig } from './settings.ts'
export { AudioConfig } from './settings.ts'
export type { VisionProviderConfig, VisionSettings, VisionScope, LooklookSettings, LooklookScope, AudioProviderConfig, AudioSettings, AudioScope } from './settings.ts'
export type { DescribeImageInput, DescribeResult } from './vision-client.ts'
export { describeImages, statusMessage } from './vision-client.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook'

/** Required services: settings, llm, sessions, credentials, tools, systemPrompt, fs. */
export const inject = ['settings', 'llm', 'sessions', 'credentials', 'tools', 'systemPrompt', 'fs']

/**
 * Plugin body: register the feature toggles + vision/audio settings
 * namespaces, declare them as configurable providers (the rc.6 standard way
 * to expose a namespace to the configuration client), register the unified
 * looklook_see / process_zip tools, the upload RPC, and the ASR install RPC.
 */
export function apply(ctx: Context, config: VisionSettings): void {
  // Feature master switches (settings page → plugin area).
  const features: LooklookScope = ctx.settings.register(settingsNamespace('looklook'), LooklookConfig, { base: undefined })
  const scope: VisionScope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config })
  // Audio model (L2+L3 merged): API providers; local ASR install state on disk.
  const audioScope: AudioScope = ctx.settings.register(settingsNamespace('looklook-audio'), AudioConfig, { base: undefined })

  // Standard settings exposure: api-proxy serves every configurable
  // provider's settingsNs to the configuration client. Declaring the three
  // namespaces here makes the settings page read/write them WITHOUT patching
  // dsh-host-apiproxy's WEB_SETTINGS_NAMESPACES. Providers are informational
  // (no adapter is registered); they never appear as selectable conversation
  // models because the model catalog comes from registered adapters.
  ctx.llm.registerConfigurableProviders([
    { provider: 'looklook-features', displayName: '看看·功能开关', settingsNs: 'looklook', settingsPath: [] },
    { provider: 'looklook-vision', displayName: '看看·视觉模型', settingsNs: 'vision', settingsPath: [] },
    { provider: 'looklook-audio', displayName: '看看·音频模型', settingsNs: 'looklook-audio', settingsPath: [] },
  ])

  const imageRecognitionEnabled = (): boolean => looklookFeatures(features).imageRecognition
  const videoRecognitionEnabled = (): boolean => looklookFeatures(features).videoRecognition

  // Host receiver for the client's RPCs (model discovery, upload, ASR install,
  // session modality). All ride the authorized api-proxy connection.
  ctx.plugin(LooklookRemoteService)

  // The unified "look at anything" tool (image / video / zip / document branches).
  registerSeeTool(ctx, scope, audioScope, features, videoRecognitionEnabled)

  // Tell the main model how to see content and how uploads land.
  ctx.systemPrompt.section({
    name: 'looklook:vision',
    order: 200,
    text: '用户发送的图片/视频/文件会保存到会话工作区的 .uploads/ 目录，消息中会带有文件路径。当需要了解任何内容时，调用 looklook_see 工具：source 填消息里的文件路径或引用，question 根据用户的实际问题填写（用户问什么就针对性地问什么，不要一律要求全量描述）。',
  })

  // ZIP extraction tool (vendored from dsh-zip): extract operation only —
  // the "look at zip contents" branch lives in looklook_see.
  registerZipTool(ctx)
}
