/**
 * Unified document reader entry: detects the format from the file extension,
 * then dispatches to the format-specific parser. OOXML formats load as ZIP
 * packages; PSD parses as a binary Photoshop document (see `psd-tool`).
 */
import type { OfficeFormat, ParsedDocument } from './types.ts';
export type { OfficeFormat, ParsedDocument, DocSection, ExtractedImage } from './types.ts';
export type { ParsedPsd, PsdNode, PsdLayerImage } from './psd-types.ts';
export { parsePsd, loadLayerImage, loadCompositePreview, encodePng, extractLayerPng } from './psd.ts';
/** Supported file extensions mapped to their format. */
export declare const FORMAT_EXTENSIONS: Readonly<Record<string, OfficeFormat>>;
/** Infer the format from a file name; undefined for unsupported extensions. */
export declare function formatFromName(fileName: string): OfficeFormat | undefined;
/**
 * Parse an Office document from raw bytes.
 * @param data - the file bytes.
 * @param fileName - the original file name (used for format detection and errors).
 * @returns the parsed document.
 * @throws when the bytes are not an OOXML container or the format is unsupported.
 */
export declare function readDocument(data: Uint8Array, fileName: string): Promise<ParsedDocument>;
