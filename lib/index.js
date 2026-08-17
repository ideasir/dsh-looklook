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
 * Plugin-owned settings are read and written through the authorized
 * `remote.looklook` RPC namespace. They are deliberately NOT registered as
 * configurable LLM providers, because rc.6 renders every such entry in the
 * global model-provider picker. No `WEB_SETTINGS_NAMESPACES` patch.
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
 * namespaces, expose their private settings RPCs, register the unified
 * looklook_see / process_zip tools, the upload RPC, and the ASR install RPC.
 */
export function apply(ctx, config) {
    // Feature master switches (settings page → plugin area).
    const features = ctx.settings.register(settingsNamespace('looklook'), LooklookConfig, { base: undefined });
    const scope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config });
    // Audio model (L2+L3 merged): API providers; local ASR install state on disk.
    const audioScope = ctx.settings.register(settingsNamespace('looklook-audio'), AudioConfig, { base: undefined });
    // Plugin-owned settings are served through the private remote.looklook RPCs
    // below. Do NOT register them as configurable LLM providers: rc.6 exposes
    // every such entry in the global model-provider picker, which makes plugin
    // settings appear as fake models.
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
