/**
 * looklook_see — the unified "look at anything" tool.
 *
 * One tool name for every content type; the tool itself decides how to look:
 * - local image file → vision model;
 * - local video file or video URL → frames + audio understanding;
 * - ZIP archive → list its contents;
 * - document files (.docx/.xlsx/.pptx/.pdf/.psd) → extracted digest.
 *
 * The main model only needs to remember ONE tool for understanding content:
 * looklook_see(source, question). (process_zip stays separate for the
 * extract operation, which changes the filesystem rather than understanding
 * content.)
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { looklookFeatures } from "./settings.js";
import { describeImageFile } from "./describe-tool.js";
import { watchVideo } from "./video-tool.js";
import { readDocumentFile, isDocumentPath } from "./doc-tool.js";
import { ZipStore, DEFAULT_MAX_ZIP_SIZE } from "./zip-store.js";
import { buildEntryTree } from "./zip-tool.js";
/** Image file extensions the tool can read directly from disk (must be
 * media types the vision endpoints accept: png/jpeg/webp/gif). */
const IMAGE_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
/** Video file extensions (local video files). */
const VIDEO_FILE_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v'];
/** Remote-image URL detection: an http(s) URL whose path ends in an image ext. */
function isImageUrl(source) {
    const path = source.split(/[?#]/)[0] ?? source;
    const dot = path.toLowerCase().lastIndexOf('.');
    const ext = dot >= 0 ? path.toLowerCase().slice(dot) : '';
    return IMAGE_FILE_EXTENSIONS.includes(ext);
}
function classifySource(source) {
    const lower = source.toLowerCase();
    if (/^https?:\/\//.test(source)) {
        return isImageUrl(source) ? 'image-file' : 'video-url';
    }
    const dot = lower.lastIndexOf('.');
    const ext = dot >= 0 ? lower.slice(dot) : '';
    if (IMAGE_FILE_EXTENSIONS.includes(ext))
        return 'image-file';
    if (VIDEO_FILE_EXTENSIONS.includes(ext))
        return 'video-file';
    if (ext === '.zip')
        return 'zip';
    if (isDocumentPath(source))
        return 'document';
    // JSON image reference (legacy session records) — exact shape check, not a
    // loose substring, so a bare alphanumeric file name is never misread.
    if (/^\s*\{\s*"attachmentId"/.test(source) || /^\s*\{\s*"path"/.test(source))
        return 'image-file';
    // Bare attachment id (legacy session records): attachment ids are
    // sha256-style hashes with a colon, not arbitrary strings.
    if (/^[a-f0-9]{8,}$/.test(source.trim()) || /^sha256:[a-f0-9]{8,}$/i.test(source.trim()))
        return 'image-file';
    return 'unknown';
}
/** List a ZIP archive's contents. */
async function listZip(path, question) {
    try {
        const store = new ZipStore({ maxSize: DEFAULT_MAX_ZIP_SIZE });
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
export function registerSeeTool(ctx, visionScope, audioScope, features, videoRecognitionEnabled) {
    ctx.tools.register(defineTool({
        name: 'looklook_see',
        description: '查看并理解任何内容（图片、视频、压缩包、文档）并回答关于它的问题。source 填内容来源：用户消息里的图片引用（原样复制）、本地图片/视频/压缩包/文档文件路径、或视频链接；question 填你要询问的问题（用户问什么就针对性地问什么）。图片内容对模型不可见，调用本工具是看到的唯一方式。',
        parameters: {
            source: {
                type: 'string',
                required: true,
                description: '内容来源：文件路径（图片/视频/zip/文档如 docx/pdf/psd）、图片引用 JSON、或视频链接 URL。',
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
                case 'image-file': {
                    if (!looklookFeatures(features).imageRecognition) {
                        return { text: '图像识别已关闭：请在插件设置中开启「识别图像」后再使用。' };
                    }
                    const cwd = exec.agent?.session.header.cwd;
                    return { text: await describeImageFile(ctx, visionScope, source, question, exec.signal, cwd) };
                }
                case 'video-file':
                case 'video-url': {
                    return { text: await watchVideo(ctx, audioScope, visionScope, videoRecognitionEnabled, source, question, exec.signal) };
                }
                case 'zip': {
                    return { text: await listZip(source, question) };
                }
                case 'document': {
                    const cwd = exec.agent?.session.header.cwd;
                    return { text: await readDocumentFile(ctx, visionScope, audioScope, source, question, cwd, exec.signal) };
                }
                default:
                    return { text: `无法识别该内容类型（source=${source}）。支持：图片（文件路径）、视频（文件或链接）、压缩包（.zip）、文档（.docx/.xlsx/.pptx/.pdf/.psd）。` };
            }
        },
    }));
}
