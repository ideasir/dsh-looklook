/**
 * dsh-looklook — "look at anything" for DeepSeek Harness.
 *
 * Host plugin. A single master switch (`looklook.enabled`) controls the whole
 * plugin:
 * - ON (default): every capability is enabled. Images / videos / archives /
 *   documents are routed through the plugin's own file channel (upload into
 *   the session `.uploads/`, the model sees only the path, then calls
 *   `looklook_see`), so the api-proxy's native "model does not support image
 *   input" check is never reached — no request rewriting, no admission
 *   override, no harness patch.
 * - OFF: the plugin is dormant — nothing is intercepted, the see tool answers
 *   "已关闭", and DSH behaves exactly as if the plugin were absent.
 *
 * Settings exposure is the standard rc.6 mechanism: the `vision`,
 * `looklook`, and `looklook-audio` namespaces are declared through
 * `llm.registerConfigurableProviders()`, and dsh-host-apiproxy's
 * configuration-client boundary automatically serves every configurable
 * provider's settings namespace. No `WEB_SETTINGS_NAMESPACES` patch.
 *
 * Upload / ASR install / model discovery / env check are Remote RPCs on the
 * `looklook` wire namespace (Typert), so they inherit the api-proxy
 * connection authorization instead of exposing unauth'd HTTP routes.
 *
 * All registrations are effects: unloading the plugin removes the settings
 * namespaces, the routes, and every disposer.
 */
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { Config, LooklookConfig, AudioConfig } from "./settings.js";
import { registerSeeTool } from "./see-tool.js";
import { registerZipTool } from "./zip-tool.js";
import { LooklookRemoteService } from "./remote.js";
export { Config } from "./settings.js";
export { LooklookConfig } from "./settings.js";
export { AudioConfig } from "./settings.js";
export { describeImages, statusMessage } from "./vision-client.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook';
/** Required services: settings, llm, sessions, credentials, tools, systemPrompt, fs. */
export const inject = ['settings', 'llm', 'sessions', 'credentials', 'tools', 'systemPrompt', 'fs'];
/**
 * Plugin body: register the feature toggles + vision/audio settings
 * namespaces, declare them as configurable providers (the rc.6 standard way
 * to expose a namespace to the configuration client), register the unified
 * looklook_see / process_zip tools, the upload RPC, and the ASR install RPC.
 */
export function apply(ctx, config) {
    // Feature master switches (settings page → plugin area).
    const features = ctx.settings.register(settingsNamespace('looklook'), LooklookConfig, { base: undefined });
    const scope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config });
    // Audio model (L2+L3 merged): API providers; local ASR install state on disk.
    const audioScope = ctx.settings.register(settingsNamespace('looklook-audio'), AudioConfig, { base: undefined });
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
    ]);
    // Master switch: one switch controls the whole plugin (ON = all features,
    // OFF = dormant, harness behaves as without it). The see tool answers
    // "已关闭" when OFF; client interception is gated by the same flag.
    // Host receiver for the client's RPCs (model discovery, upload, ASR install,
    // session modality, env check). All ride the authorized api-proxy connection.
    ctx.plugin(LooklookRemoteService);
    // The unified "look at anything" tool (image / video / zip / document branches).
    registerSeeTool(ctx, scope, audioScope, features);
    // Tell the main model how to see content and how uploads land.
    ctx.systemPrompt.section({
        name: 'looklook:vision',
        order: 200,
        text: '用户发送的图片/视频/文件会保存到会话工作区的 .uploads/ 目录，消息中会带有文件路径。当需要了解任何内容时，调用 looklook_see 工具：source 填消息里的文件路径或引用，question 根据用户的实际问题填写（用户问什么就针对性地问什么，不要一律要求全量描述）。',
    });
    // ZIP extraction tool (vendored from dsh-zip): extract operation only —
    // the "look at zip contents" branch lives in looklook_see.
    registerZipTool(ctx);
}
