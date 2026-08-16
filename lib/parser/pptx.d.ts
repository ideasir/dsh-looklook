/**
 * .pptx reader: enumerates slides in presentation order, extracts each slide's
 * shape texts (title, body, tables, notes via the notes slide part), and
 * resolves embedded images (`p:pic` blips) through each slide's rels into
 * `ppt/media/*`. The notes slide is appended to its slide's section.
 */
import type { ParsedDocument } from './types.ts';
import type { OfficePackage } from './package.ts';
/**
 * Parse a .pptx package into slide sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (one section per slide, notes appended).
 */
export declare function parsePptx(pkg: OfficePackage): ParsedDocument;
