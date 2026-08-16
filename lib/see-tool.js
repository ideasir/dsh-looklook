/**
 * looklook_see — the unified "look at anything" tool.
 *
 * One tool name for every content type; the tool itself decides how to look:
 * - image reference (from a user message) or local image file → vision model;
 * - local video file or video URL → frames + audio understanding;
 * - ZIP archive → list its contents.
 * PDF / spreadsheets / documents will join as more branches.
 *
 * The main model only needs to remember ONE tool for understanding content:
 * looklook_see(source, question). (process_zip stays separate for the
 * extract operation, which changes the filesystem rather than understanding
 * content.)
 */
import { readFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { looklookFeatures } from "./settings.js";
import { describeImageByRef } from "./describe-tool.js";
import { watchVideo } from "./video-tool.js";
import { ZipStore, DEFAULT_MAX_ZIP_SIZE, DEFAULT_EXTRACT_DIR } from "./zip-store.js";
import { buildEntryTree } from "./zip-tool.js";
import { describeImages } from "./vision-client.js";
/** Image file extensions the tool can read directly from disk. */
const IMAGE_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'];
/** Video file extensions (local video files). */
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
/** MIME map for local image files fed to the vision model. */
function mediaTypeOf(ext) {
    switch (ext) {
        case '.png': return 'image/png';
        case '.gif': return 'image/gif';
        case '.webp': return 'image/webp';
        case '.bmp': return 'image/bmp';
        case '.avif': return 'image/avif';
        default: return 'image/jpeg';
    }
}
function classifySource(source) {
    const lower = source.toLowerCase();
    if (/^https?:\/\//.test(source))
        return 'video-url';
    const dot = lower.lastIndexOf('.');
    const ext = dot >= 0 ? lower.slice(dot) : '';
    if (IMAGE_FILE_EXTENSIONS.includes(ext))
        return 'image-file';
    if (VIDEO_FILE_EXTENSIONS.includes(ext))
        return 'video-file';
    if (ext === '.zip')
        return 'zip';
    // JSON image reference or bare attachmentId.
    if (lower.includes('attachmentid') || /^[a-z0-9_-]{10,}$/.test(source.trim()))
        return 'image-ref';
    return 'unknown';
}
/** Read a local image file and describe it with the vision model. */
async function describeLocalImage(ctx, visionScope, path, question, signal) {
    try {
        const data = await readFile(path);
        const dot = path.toLowerCase().lastIndexOf('.');
        const ext = dot >= 0 ? path.toLowerCase().slice(dot) : '';
        const credentials = ctx.get('credentials');
        const resolveApiKey = async (ref) => {
            if (credentials === undefined)
                return undefined;
            const resolvedCred = await credentials.resolve(credentialRef(ref));
            return resolvedCred?.value;
        };
        const providers = visionScope.get().providers.filter(provider => provider.enabled !== false);
        const maxChars = visionScope.get().maxDescribeChars;
        const result = await describeImages(providers, resolveApiKey, [{ mediaType: mediaTypeOf(ext), data }], maxChars, signal, question);
        if (!result.ok)
            return '识图失败：' + result.message;
        return result.text;
    }
    catch (error) {
        return '识图失败：' + (error instanceof Error ? error.message : String(error));
    }
}
/** List a ZIP archive's contents. */
async function listZip(path, question) {
    try {
        const store = new ZipStore({ maxSize: DEFAULT_MAX_ZIP_SIZE, extractDir: DEFAULT_EXTRACT_DIR });
        const entries = await store.list(path);
        const fileCount = entries.filter(e => !e.isDirectory).length;
        const dirCount = entries.filter(e => e.isDirectory).length;
        return `压缩包内容（${fileCount} 个文件，${dirCount} 个目录）：\n\n${buildEntryTree(entries)}\n\n【用户问题】${question}`;
    }
    catch (error) {
        return '查看压缩包失败：' + (error instanceof Error ? error.message : String(error));
    }
}
/** Register the unified looklook_see tool. */
export function registerSeeTool(ctx, visionScope, audioScope, features, refRegistry, videoRecognitionEnabled) {
    ctx.tools.register(defineTool({
        name: 'looklook_see',
        description: '查看并理解任何内容（图片、视频、压缩包等）并回答关于它的问题。source 填内容来源：用户消息里的图片引用（原样复制）、本地图片/视频/压缩包文件路径、或视频链接；question 填你要询问的问题（用户问什么就针对性地问什么）。图片内容对模型不可见，调用本工具是看到的唯一方式。',
        parameters: {
            source: {
                type: 'string',
                required: true,
                description: '内容来源：图片引用 JSON、文件路径（图片/视频/zip）、或视频链接 URL。',
            },
            question: {
                type: 'string',
                required: true,
                description: '你要询问的内容相关问题。',
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
            render: (_args, value) => [{ type: 'text', text: value.text }],
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const source = typeof args.source === 'string' && args.source.trim() !== '' ? args.source.trim() : '';
            if (source === '')
                return { text: '看内容失败：缺少 source 参数' };
            const question = typeof args.question === 'string' && args.question.trim() !== ''
                ? args.question.trim()
                : '请描述这个内容。';
            const kind = classifySource(source);
            switch (kind) {
                case 'image-ref': {
                    if (!looklookFeatures(features).imageRecognition) {
                        return { text: '图像识别已关闭：请在插件设置中开启「识别图像」后再使用。' };
                    }
                    return { text: await describeImageByRef(ctx, visionScope, refRegistry, source, question, exec.signal) };
                }
                case 'image-file': {
                    if (!looklookFeatures(features).imageRecognition) {
                        return { text: '图像识别已关闭：请在插件设置中开启「识别图像」后再使用。' };
                    }
                    return { text: await describeLocalImage(ctx, visionScope, source, question, exec.signal) };
                }
                case 'video-file':
                case 'video-url': {
                    return { text: await watchVideo(ctx, audioScope, visionScope, videoRecognitionEnabled, source, question, exec.signal) };
                }
                case 'zip': {
                    return { text: await listZip(source, question) };
                }
                default:
                    return { text: `无法识别该内容类型（source=${source}）。支持：图片（引用或文件路径）、视频（文件或链接）、压缩包（.zip）。` };
            }
        },
    }));
}
