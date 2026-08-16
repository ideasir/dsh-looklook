/**
 * .xlsx reader: enumerates workbook sheets in order, extracts each sheet's
 * cell grid (shared strings, inline strings, numbers, formulas' cached values,
 * booleans), aligns cells by their column reference so sparse rows keep their
 * positions, and expands merged cells to their anchor value. Embedded images
 * are resolved through the sheet's drawing part into `xl/media/*`.
 */
import type { ParsedDocument } from './types.ts';
import type { OfficePackage } from './package.ts';
/**
 * Parse a .xlsx package into sheet sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (one section per sheet).
 */
export declare function parseXlsx(pkg: OfficePackage): ParsedDocument;
