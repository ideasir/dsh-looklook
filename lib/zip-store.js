/**
 * dsh-looklook/zip — ZIP file processing core (vendored from @ideasir/dsh-zip).
 *
 * Provides ZipStore class with extract, list, and read-entry operations.
 * Each ZIP extraction is placed in a dedicated directory:
 *   <parentDir>/.zip/<uuid>/extracted/
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve, dirname, normalize, isAbsolute, sep } from 'node:path';
import { statSync } from 'node:fs';
import AdmZip from 'adm-zip';
// ── Constants ──
/** Default maximum uncompressed size for a single ZIP file (500 MB). */
export const DEFAULT_MAX_ZIP_SIZE = 500 * 1024 * 1024;
/** Default extract directory name. */
export const DEFAULT_EXTRACT_DIR = '.zip';
/** Compressed archive can be up to 2x the max uncompressed size. */
const ARCHIVE_SIZE_FACTOR = 2;
// ── Helpers ──
/**
 * Check if a normalized entry name constitutes path traversal.
 * Only rejects entries that actually escape the target directory.
 */
function isPathTraversal(entryName) {
    const normalized = normalize(entryName);
    const segments = normalized.split(sep).filter(Boolean);
    let depth = 0;
    for (const seg of segments) {
        if (seg === '..')
            depth--;
        else
            depth++;
        if (depth < 0)
            return true;
    }
    return false;
}
/**
 * Check if a normalized entry name is an absolute path.
 */
function isAbsolutePathEntry(entryName) {
    return isAbsolute(entryName) || /^[A-Za-z]:[/\\]/.test(entryName);
}
/**
 * Validate a ZIP entry name for path traversal safety.
 * Applied to both file and directory entries.
 */
function validateEntryName(entryName) {
    if (isPathTraversal(entryName) || isAbsolutePathEntry(entryName)) {
        throw new Error(`ZIP extraction failed: path traversal detected in entry "${entryName}"`);
    }
}
// ── ZipStore ──
export class ZipStore {
    maxSize;
    maxArchiveSize;
    extractDir;
    /**
     * @param config - Configuration. `maxSize` defaults to 500 MB, `extractDir` defaults to '.zip'.
     */
    constructor(config = {}) {
        const maxSize = config.maxSize ?? DEFAULT_MAX_ZIP_SIZE;
        this.maxSize = maxSize;
        this.maxArchiveSize = maxSize * ARCHIVE_SIZE_FACTOR;
        this.extractDir = config.extractDir ?? DEFAULT_EXTRACT_DIR;
    }
    /**
     * List the contents of a ZIP file without extracting.
     * Checks archive file size before loading into memory.
     */
    async list(zipPath) {
        const stats = statSync(resolve(zipPath));
        if (stats.size > this.maxArchiveSize) {
            throw new Error(`ZIP file too large: ${stats.size} bytes exceeds maximum archive size (${this.maxArchiveSize} bytes)`);
        }
        const zip = new AdmZip(resolve(zipPath));
        const entries = zip.getEntries();
        return entries.map(entry => ({
            name: entry.entryName,
            isDirectory: entry.isDirectory,
            size: entry.isDirectory ? undefined : entry.header.size,
            modifiedAt: entry.header.time ? new Date(entry.header.time).toISOString() : undefined,
        }));
    }
    /**
     * Extract a ZIP file to a dedicated directory.
     * Each extraction creates: <parentDir>/.zip/<uuid>/extracted/
     *
     * On any failure (size limit, path traversal, abort, adm-zip error),
     * the orphan directory is cleaned up automatically.
     */
    async extract(zipPath, signal) {
        const id = randomUUID();
        const resolvedZipPath = resolve(zipPath);
        const zipDir = resolve(dirname(resolvedZipPath), this.extractDir, id);
        const extractRoot = join(zipDir, 'extracted');
        try {
            // Check archive file size before loading
            const stats = statSync(resolvedZipPath);
            if (stats.size > this.maxArchiveSize) {
                throw new Error(`ZIP file too large: ${stats.size} bytes exceeds maximum archive size (${this.maxArchiveSize} bytes)`);
            }
            signal?.throwIfAborted();
            // Create the extraction directory
            await mkdir(extractRoot, { recursive: true });
            signal?.throwIfAborted();
            const zip = new AdmZip(resolvedZipPath);
            const entries = zip.getEntries();
            // Validate ALL entries before extracting (files and directories)
            let totalSize = 0;
            for (const entry of entries) {
                validateEntryName(entry.entryName); // validates directories too
                if (entry.isDirectory)
                    continue;
                totalSize += entry.header.size;
                if (totalSize > this.maxSize) {
                    throw new Error(`ZIP extraction failed: total uncompressed size (${totalSize} bytes) ` +
                        `exceeds maximum (${this.maxSize} bytes)`);
                }
            }
            signal?.throwIfAborted();
            // Extract all entries (adm-zip's extractAllTo is synchronous)
            zip.extractAllTo(extractRoot, true);
            const entryList = entries.map(entry => ({
                name: entry.entryName,
                isDirectory: entry.isDirectory,
                size: entry.isDirectory ? undefined : entry.header.size,
                modifiedAt: entry.header.time ? new Date(entry.header.time).toISOString() : undefined,
            }));
            return {
                id,
                rootDir: extractRoot,
                entries: entryList,
                fileCount: entryList.filter(e => !e.isDirectory).length,
                dirCount: entryList.filter(e => e.isDirectory).length,
            };
        }
        catch (err) {
            // Cleanup orphan directory on any failure (including abort)
            await rm(zipDir, { recursive: true, force: true }).catch(() => { });
            throw err;
        }
    }
    /**
     * Read a specific entry from a ZIP file without extracting the whole archive.
     * Only reads from non-directory entries.
     */
    async readEntry(zipPath, entryName) {
        const stats = statSync(resolve(zipPath));
        if (stats.size > this.maxArchiveSize) {
            throw new Error(`ZIP file too large: ${stats.size} bytes exceeds maximum archive size (${this.maxArchiveSize} bytes)`);
        }
        const zip = new AdmZip(resolve(zipPath));
        const entry = zip.getEntry(entryName);
        if (entry === null || entry === undefined) {
            throw new Error(`Entry not found in ZIP: "${entryName}"`);
        }
        if (entry.isDirectory) {
            throw new Error(`Cannot read entry "${entryName}": it is a directory`);
        }
        return entry.getData();
    }
}
export default ZipStore;
