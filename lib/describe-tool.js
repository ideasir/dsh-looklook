/**
 * Image recognition logic for looklook ("look at anything").
 *
 * The MAIN MODEL decides what to ask the vision model: it passes an image
 * reference or file path plus whatever question it judges appropriate. The
 * unified looklook_see tool dispatches here for image sources.
 *
 * Files are read through the `fs` service so the sandbox policy applies
 * (a bare readFile would let the model exfiltrate any path it names).
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { enabledProviders } from "./settings.js";
import { describeImages } from "./vision-client.js";
import { isImageRef, parseContentRef } from "./ref.js";
/** Read local file bytes through the fs service (sandbox policy applies). */
async function readLocalFile(ctx, path, cwd, signal) {
    const fs = ctx.get('fs');
    if (fs === undefined)
        throw new Error('fs 服务不可用');
    const target = await fs.resolve(path, { ...cwd === undefined ? {} : { cwd }, signal });
    const info = await fs.stat(target, signal);
    if (info === undefined)
        throw new Error(`无法读取 "${target.displayPath}"：文件不存在`);
    if (info.type !== 'file')
        throw new Error(`无法读取 "${target.displayPath}"：不是普通文件`);
    // 32 MB cap for a single image fed to the vision model.
    const data = await fs.readBytes(target, signal, 32 * 1024 * 1024);
    return { displayPath: target.displayPath, data };
}
/** Map a file extension to an image media type for the vision request. */
function mediaTypeOf(path) {
    const dot = path.toLowerCase().lastIndexOf('.');
    const ext = dot >= 0 ? path.toLowerCase().slice(dot) : '';
    switch (ext) {
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.webp': return 'image/webp';
        default: return 'image/jpeg';
    }
}
/**
 * Describe one image — a local file path, an image URL, or a legacy image
 * reference (JSON or bare attachment id from an old session record) — using
 * the vision model.
 * @param cwd - the session working directory (resolves relative paths).
 * @returns the description text (or a failure message).
 */
export async function describeImageFile(ctx, scope, source, question, signal, cwd) {
    try {
        let mediaType;
        let data;
        // 1) Image URL: fetch bytes (credential-free, redirects rejected). Check
        // Content-Length first so an oversized remote file is rejected without
        // buffering it into memory (P2: unbounded read → OOM).
        if (/^https?:\/\//.test(source)) {
            const response = await fetch(source, { redirect: 'error', signal });
            if (!response.ok)
                return `识图失败：HTTP ${response.status}`;
            const declared = Number(response.headers.get('content-length'));
            if (Number.isFinite(declared) && declared > 32 * 1024 * 1024) {
                return '识图失败：图片超过 32MB 上限';
            }
            const buf = Buffer.from(await response.arrayBuffer());
            if (buf.length > 32 * 1024 * 1024)
                return '识图失败：图片超过 32MB 上限';
            mediaType = mediaTypeOf(source);
            data = buf;
        }
        else {
            // 2) Legacy image reference (attachmentId JSON from an old record).
            const parsed = parseContentRef(source);
            if (parsed !== undefined && isImageRef(parsed)) {
                try {
                    const stored = await ctx.attachments.readImage(parsed, signal);
                    mediaType = stored.ref.mediaType;
                    data = stored.data;
                }
                catch {
                    // Attachment no longer resolvable (bytes:0 placeholder refs fail
                    // integrity); fall through to file-path handling for the string.
                    return '识图失败：该图片引用已不可用（会话重启后旧图片引用无法解析，请重新上传图片）';
                }
            }
            else {
                // 3) Local file path (session .uploads/ or any sandbox-visible file).
                const loaded = await readLocalFile(ctx, source, cwd, signal);
                mediaType = mediaTypeOf(loaded.displayPath);
                data = loaded.data;
            }
        }
        const providers = enabledProviders(scope);
        const maxChars = scope.get().maxDescribeChars;
        const credentials = ctx.get('credentials');
        const resolveApiKey = async (ref) => {
            if (credentials === undefined)
                return undefined;
            const resolvedCred = await credentials.resolve(credentialRef(ref));
            return resolvedCred?.value;
        };
        const result = await describeImages(providers, resolveApiKey, [{ mediaType, data }], maxChars, signal, question);
        if (!result.ok)
            return '识图失败：' + result.message;
        return result.text;
    }
    catch (error) {
        return '识图失败：' + (error instanceof Error ? error.message : String(error));
    }
}
