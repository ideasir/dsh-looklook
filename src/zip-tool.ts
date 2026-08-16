/**
 * dsh-looklook/zip-tool — the `process_zip` tool (vendored from
 * @ideasir/dsh-zip): list, extract, and read entries of ZIP archives.
 *
 * The tool is always registered; the upload channel's extension whitelist
 * (whether archives reach `.uploads/` at all) is governed by the
 * `moreExtensions` switch instead.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ZipStore, DEFAULT_MAX_ZIP_SIZE, DEFAULT_EXTRACT_DIR } from './zip-store.ts'
import type { ZipEntry, ZipExtractResult, ZipConfig } from './zip-store.ts'

// ── Types ──

/** Arguments for the process_zip tool. */
export interface ToolArgs {
  path: string
  action: 'list' | 'extract' | 'read_entry'
  entry?: string
}

/** Output from the process_zip tool. */
export type ToolOutput =
  | { kind: 'list'; entries: ZipEntry[]; fileCount: number; dirCount: number }
  | { kind: 'extract'; id: string; rootDir: string; entries: ZipEntry[]; fileCount: number; dirCount: number }
  | { kind: 'read_entry'; name: string; content: string; size: number }

// ── Tool metadata ──

export const TOOL_NAME = 'process_zip'

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
].join('\n')

export const TOOL_PARAMETERS = {
  path: {
    type: 'string' as const,
    required: true as const,
    description: 'Absolute path to the ZIP file to process.',
  },
  action: {
    type: 'string' as const,
    required: true as const,
    enum: ['list', 'extract', 'read_entry'] as const,
    description: [
      'Action to perform:',
      '- "list": Show ZIP contents',
      '- "extract": Extract all files',
      '- "read_entry": Read a specific entry as text',
    ].join('\n'),
  },
  entry: {
    type: 'string' as const,
    description: 'Entry path within the archive (required for "read_entry" action).',
  },
}

export const TOOL_OUTPUT_SCHEMA = {
  oneOf: [
    {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        kind: { type: 'string' as const, const: 'list' as const, required: true as const },
        entries: {
          type: 'array' as const,
          items: { type: 'object' as const, additionalProperties: true },
          required: true as const,
        },
        fileCount: { type: 'number' as const, required: true as const },
        dirCount: { type: 'number' as const, required: true as const },
      },
    },
    {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        kind: { type: 'string' as const, const: 'extract' as const, required: true as const },
        id: { type: 'string' as const, required: true as const },
        rootDir: { type: 'string' as const, required: true as const },
        entries: {
          type: 'array' as const,
          items: { type: 'object' as const, additionalProperties: true },
          required: true as const,
        },
        fileCount: { type: 'number' as const, required: true as const },
        dirCount: { type: 'number' as const, required: true as const },
      },
    },
    {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        kind: { type: 'string' as const, const: 'read_entry' as const, required: true as const },
        name: { type: 'string' as const, required: true as const },
        content: { type: 'string' as const, required: true as const },
        size: { type: 'number' as const, required: true as const },
      },
    },
  ],
} as const

// ── Helpers ──

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function buildEntryTree(entries: ZipEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
  return sorted
    .map(entry => {
      const icon = entry.isDirectory ? '📁' : '📄'
      const size = entry.size !== undefined ? ` (${formatSize(entry.size)})` : ''
      return `${icon} ${entry.name}${size}`
    })
    .join('\n')
}

export function buildExtractSummary(result: ZipExtractResult): string {
  return [
    `Extracted to: \`${result.rootDir}\``,
    `Files: ${result.fileCount}`,
    `Directories: ${result.dirCount}`,
    '',
    'Contents:',
    buildEntryTree(result.entries),
  ].join('\n')
}

// ── Execution ──

/**
 * Execute the process_zip tool.
 * @param store - ZipStore instance for ZIP operations.
 * @param args - Tool arguments (path, action, entry).
 * @param signal - Optional cancellation signal.
 */
export async function executeTool(
  store: ZipStore,
  args: ToolArgs,
  signal?: AbortSignal,
): Promise<ToolOutput> {
  const { path, action, entry } = args

  // Validate action
  const validActions = ['list', 'extract', 'read_entry']
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action: "${action}". Must be one of: ${validActions.join(', ')}`)
  }

  // Validate path
  if (!path || path.trim().length === 0) {
    throw new Error('path must be a non-empty string')
  }

  switch (action) {
    case 'list': {
      const entries = await store.list(path)
      return {
        kind: 'list',
        entries,
        fileCount: entries.filter(e => !e.isDirectory).length,
        dirCount: entries.filter(e => e.isDirectory).length,
      }
    }
    case 'extract': {
      const result = await store.extract(path, signal)
      return {
        kind: 'extract',
        id: result.id,
        rootDir: result.rootDir,
        entries: result.entries,
        fileCount: result.fileCount,
        dirCount: result.dirCount,
      }
    }
    case 'read_entry': {
      if (!entry) {
        throw new Error('"entry" parameter is required for "read_entry" action')
      }
      const data = await store.readEntry(path, entry)
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const content = decoder.decode(data)
      return {
        kind: 'read_entry',
        name: entry,
        content,
        size: data.byteLength,
      }
    }
  }
}

// ── Registration ──

/** Register the `process_zip` tool (always available). */
export function registerZipTool(ctx: Context): void {
  const store = new ZipStore({ maxSize: DEFAULT_MAX_ZIP_SIZE, extractDir: DEFAULT_EXTRACT_DIR })
  ctx.tools.register(defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args: unknown, value: any): Array<{ type: 'text'; text: string }> => {
        switch (value.kind) {
          case 'list':
            return [{ type: 'text', text: `ZIP contents (${value.fileCount} files, ${value.dirCount} dirs):\n\n${buildEntryTree(value.entries)}` }]
          case 'extract':
            return [{ type: 'text', text: buildExtractSummary(value) }]
          case 'read_entry':
            return [{ type: 'text', text: `File: ${value.name} (${formatSize(value.size)})\n\n${value.content}` }]
          default:
            return [{ type: 'text', text: JSON.stringify(value) }]
        }
      },
    },
    async execute(args: any, exec: any): Promise<any> {
      return executeTool(store, args, exec?.signal)
    },
  }))
}
