/**
 * .pdf reader: dispatches parsing to a dedicated worker_thread (pdf-worker.mjs)
 * running pdf.js, because pdf.js's legacy build crashes on a second
 * getDocument() in the same thread (fake-worker LoopbackPort bug). Isolating
 * each parse in a fresh thread also keeps large-document parsing off the main
 * event loop. Extracts per-page text and embedded raster images (encoded to
 * PNG); pages with little text but real imagery are flagged as scans.
 */
import type { ParsedPdf } from './pdf-types.ts';
/** Hard cap on the number of pages parsed per call. */
export declare const MAX_PDF_PAGES = 100;
/**
 * Parse a PDF file into per-page text and image extractions, running in a
 * dedicated worker thread.
 * @param data - the PDF bytes.
 * @param maxPages - page cap; defaults to MAX_PDF_PAGES.
 * @returns the parsed document.
 */
export declare function parsePdf(data: Uint8Array, maxPages?: number): Promise<ParsedPdf>;
