/**
 * Parsed document model shared by the three format readers. Everything is
 * plain JSON-friendly data — no live objects cross the parser boundary.
 */
/** Supported Office formats. */
export type OfficeFormat = 'docx' | 'xlsx' | 'pptx';
/** One ordered content block inside a parsed document. */
export interface DocSection {
    /** What kind of content this block holds. */
    kind: 'heading' | 'paragraph' | 'table' | 'sheet' | 'slide' | 'notes' | 'image';
    /** Optional human-readable label (sheet name, slide number, …). */
    title?: string;
    /** The block's extracted text; tables/sheets join cells with tabs and rows with newlines. */
    text: string;
    /** Structured rows for table/sheet blocks; absent for text blocks. */
    rows?: string[][];
    /** Indices into the document's `images` array for images anchored in this block. */
    imageRefs?: number[];
}
/** One embedded image extracted from a document. */
export interface ExtractedImage {
    /** 0-based index into the document's image list, referenced by `DocSection.imageRefs`. */
    index: number;
    /** Where the image lives in the document (paragraph/slide/sheet context). */
    location: string;
    /** Image media type inferred from the package part extension. */
    mediaType: string;
    /** Raw image bytes exactly as stored in the package. */
    data: Uint8Array;
    /** Original part file name (e.g. `image1.png`), when known. */
    name?: string;
}
/** One embedded audio file (e.g. PPT background music). */
export interface ExtractedAudio {
    /** Where the audio lives in the document (usually the deck level). */
    location: string;
    /** Audio media type inferred from the package part extension. */
    mediaType: string;
    /** Raw audio bytes exactly as stored in the package. */
    data: Uint8Array;
    /** Original part file name (e.g. `audio1.mp3`), when known. */
    name?: string;
}
/** The complete parse result of one Office document. */
export interface ParsedDocument {
    format: OfficeFormat;
    /** Ordered content blocks in reading order. */
    sections: DocSection[];
    /** Every embedded image, deduplicated by package part. */
    images: ExtractedImage[];
    /** Every embedded audio (e.g. PPT background music), deduplicated by part. */
    audios?: ExtractedAudio[];
    /** Non-fatal notes collected while parsing (unsupported parts, skipped structures). */
    warnings: string[];
}
