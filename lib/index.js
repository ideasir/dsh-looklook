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
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { contentHasImage } from '@deepseek-ai/dsh-llm';
import { Config, eyeStateFor } from "./settings.js";
import { replaceImagesWithPlaceholder, translateImages } from "./translate.js";
import { LooklookRemoteService } from "./remote.js";
export { Config } from "./settings.js";
export { describeResultText, PLACEHOLDER_TEXT } from "./translate.js";
export { describeImages, statusMessage } from "./vision-client.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'looklook';
/** Required services: settings (config + eye state), llm (model capability), sessions (cache log), attachments (image bytes), credentials (API keys). */
export const inject = ['settings', 'llm', 'sessions', 'attachments', 'credentials'];
/** Recognize whether any message in the request carries image content. */
function requestHasImage(options) {
    return options.messages.some(message => contentHasImage(message.content));
}
/**
 * Plugin body: register the `vision` settings namespace, answer the image
 * admission decision point, and rewrite model requests at the
 * `agent/request-messages` waterfall.
 * @param ctx - host context.
 * @param config - composition-base configuration (the user settings layer
 *   overrides it live).
 */
export function apply(ctx, config) {
    const scope = ctx.settings.register(settingsNamespace('vision'), Config, { base: config });
    // Host receiver for the client's model-discovery RPC (settings page).
    ctx.plugin(LooklookRemoteService);
    // The gateway asks before admitting an image while the selected model is
    // text-only. This plugin services the image downstream (translation or the
    // placeholder), so the answer is always "allow" while mounted.
    ctx.on('prompt/image-admission', () => 'allow');
    ctx.on('agent/request-messages', async (_payload, request, next) => {
        if (!requestHasImage(request))
            return next();
        const eye = eyeStateFor(scope, request.sessionId);
        if (eye === 'off') {
            // Eye off: strip images to the placeholder; the model sees text only.
            return { ...request, messages: replaceImagesWithPlaceholder(request.messages) };
        }
        // Eye on: use the conversation model's own multimodal capability when it
        // declares image input; unknown capability passes through untouched so a
        // multimodal model is never degraded by this plugin.
        const info = await ctx.llm.resolveModelInfo(request.provider, request.model, request.signal);
        if (info.inputModalities === undefined || info.inputModalities.includes('image')) {
            return next();
        }
        // Eye on + text-only model: describe images via the vision provider.
        const messages = await translateImages(ctx, request.messages, request.sessionId, scope, request.signal);
        return { ...request, messages };
    });
}
