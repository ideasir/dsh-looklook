/**
 * dsh-looklook/zip — ZIP file processing core (vendored from @ideasir/dsh-zip).
 *
 * Provides ZipStore class with extract, list, and read-entry operations.
 * Each ZIP extraction is placed in a dedicated directory:
 *   <parentDir>/.zip/<uuid>/extracted/
 */
export interface ZipEntry {
    name: string;
    isDirectory: boolean;
    size?: number;
    /** ISO timestamp string (lossless-JSON-safe; a Date object is not). */
    modifiedAt?: string;
}
export interface ZipExtractResult {
    id: string;
    rootDir: string;
    entries: ZipEntry[];
    fileCount: number;
    dirCount: number;
}
export interface ZipConfig {
    /** Maximum uncompressed size for a single ZIP file (bytes). Default: 500 MB. */
    maxSize?: number;
    /** Directory name under the workspace root for storing extractions. Default: '.zip'. */
    extractDir?: string;
}
/** Default maximum uncompressed size for a single ZIP file (500 MB). */
export declare const DEFAULT_MAX_ZIP_SIZE: number;
/** Default extract directory name. */
export declare const DEFAULT_EXTRACT_DIR = ".zip";
export declare class ZipStore {
    private readonly maxSize;
    private readonly maxArchiveSize;
    private readonly extractDir;
    /**
     * @param config - Configuration. `maxSize` defaults to 500 MB, `extractDir` defaults to '.zip'.
     */
    constructor(config?: ZipConfig);
    /**
     * List the contents of a ZIP file without extracting.
     * Checks archive file size before loading into memory.
     */
    list(zipPath: string): Promise<ZipEntry[]>;
    /**
     * Extract a ZIP file to a dedicated directory.
     * Each extraction creates: <parentDir>/.zip/<uuid>/extracted/
     *
     * On any failure (size limit, path traversal, abort, adm-zip error),
     * the orphan directory is cleaned up automatically.
     */
    extract(zipPath: string, signal?: AbortSignal): Promise<ZipExtractResult>;
    /**
     * Read a specific entry from a ZIP file without extracting the whole archive.
     * Only reads from non-directory entries.
     */
    readEntry(zipPath: string, entryName: string): Promise<Uint8Array>;
}
export default ZipStore;
