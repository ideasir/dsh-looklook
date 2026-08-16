/**
 * .docx reader: walks `word/document.xml` in reading order, extracting
 * paragraphs, headings (by paragraph style), tables (row/cell grid), and
 * inline images (drawings anchored in paragraphs or cells). Header/footer
 * parts are appended as trailing sections. Images are resolved through
 * `word/_rels/document.xml.rels` into `word/media/*` parts.
 */
import type { ParsedDocument } from './types.ts';
import type { OfficePackage } from './package.ts';
/**
 * Parse a .docx package into sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (body sections, then headers/footers).
 */
export declare function parseDocx(pkg: OfficePackage): ParsedDocument;
