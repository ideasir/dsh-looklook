/**
 * PDF types: parse-result model for pdf.js-based extraction.
 */
/** One PDF page's extraction result. */
export interface PdfPage {
    /** 1-based page number. */
    pageNumber: number;
    /** Page dimensions in PDF points. */
    width: number;
    height: number;
    /** Extracted text (joined from text items). */
    text: string;
    /** Extracted raster images (already encoded as PNG/JPEG bytes). */
    images: PdfPageImage[];
    /** Whether the page looked like a scan (little text, many images). */
    isScan: boolean;
}
/** One image extracted from a PDF page, ready for vision. */
export interface PdfPageImage {
    /** Display name (XObject name). */
    name: string;
    width: number;
    height: number;
    /** Encoded bytes (PNG). */
    data: Uint8Array;
}
/** The complete parse result of one PDF file. */
export interface ParsedPdf {
    format: 'pdf';
    /** Total page count. */
    pageCount: number;
    /** Per-page extraction; pages beyond the limit are truncated. */
    pages: PdfPage[];
    /** Non-fatal parse notes. */
    warnings: string[];
}
