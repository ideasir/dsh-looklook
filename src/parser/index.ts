/**
 * Unified document reader entry: detects the format from the file extension,
 * then dispatches to the format-specific parser. OOXML formats load as ZIP
 * packages; PSD parses as a binary Photoshop document (see `psd-tool`).
 */

import type { OfficeFormat, ParsedDocument } from './types.ts'
import { isZipContainer, loadPackage } from './package.ts'
import { parseDocx } from './docx.ts'
import { parseXlsx } from './xlsx.ts'
import { parsePptx } from './pptx.ts'

export type { OfficeFormat, ParsedDocument, DocSection, ExtractedImage } from './types.ts'
export type { ParsedPsd, PsdNode, PsdLayerImage } from './psd-types.ts'
export { parsePsd, loadLayerImage, loadCompositePreview, encodePng, extractLayerPng } from './psd.ts'

/** Supported file extensions mapped to their format. */
export const FORMAT_EXTENSIONS: Readonly<Record<string, OfficeFormat>> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
}

/** Infer the format from a file name; undefined for unsupported extensions. */
export function formatFromName(fileName: string): OfficeFormat | undefined {
  const lower = fileName.toLowerCase()
  for (const [ext, format] of Object.entries(FORMAT_EXTENSIONS)) {
    if (lower.endsWith(ext)) return format
  }
  return undefined
}

/**
 * Parse an Office document from raw bytes.
 * @param data - the file bytes.
 * @param fileName - the original file name (used for format detection and errors).
 * @returns the parsed document.
 * @throws when the bytes are not an OOXML container or the format is unsupported.
 */
export async function readDocument(data: Uint8Array, fileName: string): Promise<ParsedDocument> {
  const format = formatFromName(fileName)
  if (format === undefined) {
    throw new Error(`不支持的文件格式：${fileName}（仅支持 .docx / .xlsx / .pptx）`)
  }
  if (!isZipContainer(data)) {
    throw new Error(`文件不是有效的 OOXML 容器：${fileName}（可能是旧版 .doc/.xls/.ppt 二进制格式，暂不支持）`)
  }
  const pkg = await loadPackage(data)
  switch (format) {
    case 'docx': return parseDocx(pkg)
    case 'xlsx': return parseXlsx(pkg)
    case 'pptx': return parsePptx(pkg)
  }
}
