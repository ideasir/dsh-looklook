/**
 * dsh-looklook/zip-tool — the `process_zip` tool (vendored from
 * @ideasir/dsh-zip): list, extract, and read entries of ZIP archives.
 *
 * Registration is gated by the `zip` feature toggle at execution time, so
 * toggling the switch in settings takes effect without a restart.
 */
import type { Context } from '@deepseek-ai/cordis';
import { ZipStore } from './zip-store.ts';
import type { ZipEntry, ZipExtractResult } from './zip-store.ts';
import type { LooklookScope } from './settings.ts';
/** Arguments for the process_zip tool. */
export interface ToolArgs {
    path: string;
    action: 'list' | 'extract' | 'read_entry';
    entry?: string;
}
/** Output from the process_zip tool. */
export type ToolOutput = {
    kind: 'list';
    entries: ZipEntry[];
    fileCount: number;
    dirCount: number;
} | {
    kind: 'extract';
    id: string;
    rootDir: string;
    entries: ZipEntry[];
    fileCount: number;
    dirCount: number;
} | {
    kind: 'read_entry';
    name: string;
    content: string;
    size: number;
};
export declare const TOOL_NAME = "process_zip";
export declare const TOOL_DESCRIPTION: string;
export declare const TOOL_PARAMETERS: {
    path: {
        type: "string";
        required: true;
        description: string;
    };
    action: {
        type: "string";
        required: true;
        enum: readonly ["list", "extract", "read_entry"];
        description: string;
    };
    entry: {
        type: "string";
        description: string;
    };
};
export declare const TOOL_OUTPUT_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly const: "list";
                readonly required: true;
            };
            readonly entries: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: true;
                };
                readonly required: true;
            };
            readonly fileCount: {
                readonly type: "number";
                readonly required: true;
            };
            readonly dirCount: {
                readonly type: "number";
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly const: "extract";
                readonly required: true;
            };
            readonly id: {
                readonly type: "string";
                readonly required: true;
            };
            readonly rootDir: {
                readonly type: "string";
                readonly required: true;
            };
            readonly entries: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly additionalProperties: true;
                };
                readonly required: true;
            };
            readonly fileCount: {
                readonly type: "number";
                readonly required: true;
            };
            readonly dirCount: {
                readonly type: "number";
                readonly required: true;
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly const: "read_entry";
                readonly required: true;
            };
            readonly name: {
                readonly type: "string";
                readonly required: true;
            };
            readonly content: {
                readonly type: "string";
                readonly required: true;
            };
            readonly size: {
                readonly type: "number";
                readonly required: true;
            };
        };
    }];
};
export declare function formatSize(bytes: number): string;
export declare function buildEntryTree(entries: ZipEntry[]): string;
export declare function buildExtractSummary(result: ZipExtractResult): string;
/**
 * Execute the process_zip tool.
 * @param store - ZipStore instance for ZIP operations.
 * @param args - Tool arguments (path, action, entry).
 * @param signal - Optional cancellation signal.
 */
export declare function executeTool(store: ZipStore, args: ToolArgs, signal?: AbortSignal): Promise<ToolOutput>;
/**
 * Register the `process_zip` tool. Execution is gated on the live `zip`
 * feature toggle, so disabling ZIP in settings makes the tool fail loudly
 * (the schema still advertises it; the toggle is a settings decision).
 */
export declare function registerZipTool(ctx: Context, features: LooklookScope): void;
