/**
 * OOXML package helpers: ZIP inspection via fflate plus relationship and
 * media-part resolution shared by the three format readers.
 */
/** A loaded OOXML package: decoded ZIP entries keyed by part path. */
export interface OfficePackage {
    /** All decoded entries; paths use forward slashes without a leading `/`. */
    entries: Map<string, Uint8Array>;
}
/** Whether the given bytes look like an OOXML ZIP container. */
export declare function isZipContainer(data: Uint8Array): boolean;
/**
 * Decode a ZIP container into an in-memory part map. Uses fflate's streaming
 * `unzip` with a pre-decompression filter so declared entry sizes are checked
 * BEFORE bytes are materialized — a zip bomb is refused without ever
 * allocating its inflated output. Throws on corrupt or oversized input.
 */
export declare function loadPackage(data: Uint8Array): Promise<OfficePackage>;
/** Read a package part as UTF-8 text; returns undefined when the part is absent. */
export declare function readPartText(pkg: OfficePackage, path: string): string | undefined;
/**
 * Resolve a relationship id to its target part. OOXML stores image links as
 * `r:embed="rIdN"` inside content parts; the `<part>/_rels/<part>.rels` file
 * maps rIds to relative targets (usually under `media/`).
 */
export declare function resolveRelationship(pkg: OfficePackage, partPath: string, rId: string): string | undefined;
/** Infer an image media type from a package part path by extension. */
export declare function mediaTypeForPart(partPath: string): string;
/**
 * Whether the bytes match the declared media type's magic signature. Returns
 * false for a clear mismatch (e.g. an HTML file renamed to .png); unknown or
 * unverified signatures are treated as a match so legitimate files are never
 * dropped.
 */
export declare function bytesMatchMediaType(data: Uint8Array, mediaType: string): boolean;
