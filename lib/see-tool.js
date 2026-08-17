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
import { looklookEnabled } from "./settings.js";
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
export function registerSeeTool(ctx, visionScope, audioScope, features) {
    ctx.tools.register(defineTool({
        name: 'looklook_see',
        description: 'Look Look 内置查看图片、视频、zip、PSD、PPT/PDF/Word/Excel。遇到这些内容请直接调用本工具，不要先安装 npm/pip 解析依赖。source 使用原始文件路径、图片引用或视频 URL，也可直接传文件名（如 "image.png"）——自动匹配会话 .uploads/ 目录。question 使用用户的实际问题。PSD 默认返回整体设计与图层结构，不批量导出图层。',
        parameters: {
            source: {
                type: 'string',
                required: true,
                description: '内容来源：文件路径（图片/视频/zip/文档如 docx/pdf/psd）、图片引用 JSON、视频链接 URL，或直接传文件名（如 "image.png"，自动匹配会话 .uploads/ 目录）。',
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
            let source = typeof args.source === 'string' && args.source.trim() !== '' ? args.source.trim() : '';
            if (source === '')
                return { text: '看内容失败：缺少 source 参数' };
            // Master switch: OFF = plugin dormant, everything answers "已关闭".
            if (!looklookEnabled(features)) {
                return { text: '看看插件已关闭：请在「插件配置 → 看看」里开启总开关后再使用。' };
            }
            const question = typeof args.question === 'string' && args.question.trim() !== ''
                ? args.question.trim()
                : '请描述这个内容。';
            // Bare file name (no path separators / not a URL / not a legacy
            // reference): the Look Look file channel uploads user files into the
            // session `.uploads/` directory, and the message now carries only the
            // clean name. Resolve it against that directory so the main model can
            // call looklook_see("image.png", q) directly.
            if (!/^https?:\/\//i.test(source)
                && !source.includes('/')
                && !source.includes('\\')
                && !/^\s*\{/.test(source)
                && !/^[a-f0-9]{8,}$/.test(source.trim())
                && !/^sha256:[a-f0-9]{8,}$/i.test(source.trim())) {
                const execCwd = exec.agent?.session.header.cwd;
                if (execCwd !== undefined && execCwd !== '') {
                    const resolved = `${execCwd}/.uploads/${source}`;
                    source = resolved;
                }
            }
            const kind = classifySource(source);
            switch (kind) {
                case 'image-file': {
                    const cwd = exec.agent?.session.header.cwd;
                    return { text: await describeImageFile(ctx, visionScope, source, question, exec.signal, cwd) };
                }
                case 'video-file':
                case 'video-url': {
                    return { text: await watchVideo(ctx, audioScope, visionScope, source, question, exec.signal) };
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
