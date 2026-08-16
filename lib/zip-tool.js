/**
 * dsh-looklook/zip-tool — the `process_zip` tool (vendored from
 * @ideasir/dsh-zip): list, extract, and read entries of ZIP archives.
 *
 * The tool is always registered; the upload channel's extension whitelist
 * (whether archives reach `.uploads/` at all) is governed by the
 * `moreExtensions` switch instead.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ZipStore, DEFAULT_MAX_ZIP_SIZE, DEFAULT_EXTRACT_DIR } from "./zip-store.js";
// ── Tool metadata ──
export const TOOL_NAME = 'process_zip';
export const TOOL_DESCRIPTION = [
    'Process a ZIP archive file. Supports three actions:',
    '',
    '1. `list` — Show the contents of a ZIP file without extracting.',
    '   Returns a list of all files and directories with sizes.',
    '',
    '2. `extract` — Extract all files from a ZIP archive.',
    '   Each extraction creates a dedicated directory:',
    '   <parentDir>/.zip/<uuid>/extracted/',
    '   This prevents files from different ZIPs from mixing.',
    '',
    '3. `read_entry` — Read a specific file from the archive as text.',
    '   Requires the `entry` parameter specifying the file path within the ZIP.',
    '',
    'After extraction, use bash, fs, and other tools',
    'to work with the extracted files.',
].join('\n');
export const TOOL_PARAMETERS = {
    path: {
        type: 'string',
        required: true,
        description: 'Absolute path to the ZIP file to process.',
    },
    action: {
        type: 'string',
        required: true,
        enum: ['list', 'extract', 'read_entry'],
        description: [
            'Action to perform:',
            '- "list": Show ZIP contents',
            '- "extract": Extract all files',
            '- "read_entry": Read a specific entry as text',
        ].join('\n'),
    },
    entry: {
        type: 'string',
        description: 'Entry path within the archive (required for "read_entry" action).',
    },
};
export const TOOL_OUTPUT_SCHEMA = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                kind: { type: 'string', const: 'list', required: true },
                entries: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                    required: true,
                },
                fileCount: { type: 'number', required: true },
                dirCount: { type: 'number', required: true },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                kind: { type: 'string', const: 'extract', required: true },
                id: { type: 'string', required: true },
                rootDir: { type: 'string', required: true },
                entries: {
                    type: 'array',
                    items: { type: 'object', additionalProperties: true },
                    required: true,
                },
                fileCount: { type: 'number', required: true },
                dirCount: { type: 'number', required: true },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                kind: { type: 'string', const: 'read_entry', required: true },
                name: { type: 'string', required: true },
                content: { type: 'string', required: true },
                size: { type: 'number', required: true },
            },
        },
    ],
};
// ── Helpers ──
export function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function buildEntryTree(entries) {
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    return sorted
        .map(entry => {
        const icon = entry.isDirectory ? '📁' : '📄';
        const size = entry.size !== undefined ? ` (${formatSize(entry.size)})` : '';
        return `${icon} ${entry.name}${size}`;
    })
        .join('\n');
}
export function buildExtractSummary(result) {
    return [
        `Extracted to: \`${result.rootDir}\``,
        `Files: ${result.fileCount}`,
        `Directories: ${result.dirCount}`,
        '',
        'Contents:',
        buildEntryTree(result.entries),
    ].join('\n');
}
// ── Execution ──
/**
 * Execute the process_zip tool.
 * @param store - ZipStore instance for ZIP operations.
 * @param args - Tool arguments (path, action, entry).
 * @param signal - Optional cancellation signal.
 */
export async function executeTool(store, args, signal) {
    const { path, action, entry } = args;
    // Validate action
    const validActions = ['list', 'extract', 'read_entry'];
    if (!validActions.includes(action)) {
        throw new Error(`Invalid action: "${action}". Must be one of: ${validActions.join(', ')}`);
    }
    // Validate path
    if (!path || path.trim().length === 0) {
        throw new Error('path must be a non-empty string');
    }
    switch (action) {
        case 'list': {
            const entries = await store.list(path);
            return {
                kind: 'list',
                entries,
                fileCount: entries.filter(e => !e.isDirectory).length,
                dirCount: entries.filter(e => e.isDirectory).length,
            };
        }
        case 'extract': {
            const result = await store.extract(path, signal);
            return {
                kind: 'extract',
                id: result.id,
                rootDir: result.rootDir,
                entries: result.entries,
                fileCount: result.fileCount,
                dirCount: result.dirCount,
            };
        }
        case 'read_entry': {
            if (!entry) {
                throw new Error('"entry" parameter is required for "read_entry" action');
            }
            const data = await store.readEntry(path, entry);
            // Binary guard (M3): refuse to decode clearly-binary content as UTF-8
            // text; return a hint instead of mojibake.
            const sample = data.subarray(0, Math.min(data.byteLength, 1024));
            let binaryish = false;
            for (const byte of sample) {
                if (byte === 0 || (byte < 0x09) || (byte > 0x0d && byte < 0x20)) {
                    binaryish = true;
                    break;
                }
            }
            if (binaryish) {
                throw new Error(`"${entry}" 看起来是二进制文件，无法按文本读取（${data.byteLength} 字节）。请改用 extract 解压后处理。`);
            }
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const content = decoder.decode(data);
            return {
                kind: 'read_entry',
                name: entry,
                content,
                size: data.byteLength,
            };
        }
    }
}
// ── Registration ──
/** Register the `process_zip` tool (always available). */
export function registerZipTool(ctx) {
    const store = new ZipStore({ maxSize: DEFAULT_MAX_ZIP_SIZE, extractDir: DEFAULT_EXTRACT_DIR });
    ctx.tools.register(defineTool({
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters: TOOL_PARAMETERS,
        output: {
            schema: TOOL_OUTPUT_SCHEMA,
            render: (_args, value) => {
                switch (value.kind) {
                    case 'list':
                        return [{ type: 'text', text: `ZIP contents (${value.fileCount} files, ${value.dirCount} dirs):\n\n${buildEntryTree(value.entries)}` }];
                    case 'extract':
                        return [{ type: 'text', text: buildExtractSummary(value) }];
                    case 'read_entry':
                        return [{ type: 'text', text: `File: ${value.name} (${formatSize(value.size)})\n\n${value.content}` }];
                    default:
                        return [{ type: 'text', text: JSON.stringify(value) }];
                }
            },
        },
        async execute(args, exec) {
            return executeTool(store, args, exec?.signal);
        },
    }));
}
