/**
 * PDF parse worker: runs pdf.js inside a dedicated worker_thread so the
 * parser's fake-worker state never leaks between calls (pdf.js legacy build
 * crashes on a second getDocument() in the same thread). Receives the PDF
 * bytes and page cap via workerData, posts back the parsed structure.
 */

import { parentPort, workerData } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const require = createRequire(import.meta.url)

/** Hard cap on one extracted image's pixel count (skips huge decodes). */
const MAX_PDF_IMAGE_PIXELS = 40_000_000

/** pdf.js operator code for `paintImageXObject`. */
const PAINT_IMAGE = 85

/** Encode an RGB/RGBA/gray raster to PNG bytes. */
function rasterToPng(width, height, kind, data) {
  const pngjs = require('pngjs')
  const png = new pngjs.PNG({ width, height })
  const channels = kind === 3 ? 4 : kind === 2 ? 3 : kind === 4 ? 2 : 1
  if (channels === 4) {
    png.data.set(Buffer.from(data))
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      png.data[j] = data[i]
      png.data[j + 1] = data[i + 1]
      png.data[j + 2] = data[i + 2]
      png.data[j + 3] = 255
    }
  } else if (channels === 2) {
    for (let i = 0, j = 0; i < data.length; i += 2, j += 4) {
      const g = data[i]
      png.data[j] = g
      png.data[j + 1] = g
      png.data[j + 2] = g
      png.data[j + 3] = data[i + 1]
    }
  } else {
    for (let i = 0, j = 0; i < data.length; i += 1, j += 4) {
      const g = data[i]
      png.data[j] = g
      png.data[j + 1] = g
      png.data[j + 2] = g
      png.data[j + 3] = 255
    }
  }
  const sync = pngjs.PNG.sync
  return new Uint8Array(sync.write(png))
}

async function extractPage(doc, pageNumber, warnings) {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })

  const [textContent, operatorList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ])
  const text = textContent.items
    .map(item => typeof item === 'object' && item !== null && 'str' in item ? String(item.str) : '')
    .join(' ')
    .replace(/\s+/gu, ' ')
    .trim()

  const imageNames = new Set()
  for (let i = 0; i < operatorList.fnArray.length; i++) {
    if (operatorList.fnArray[i] === PAINT_IMAGE) {
      const name = operatorList.argsArray[i]?.[0]
      if (typeof name === 'string') imageNames.add(name)
    }
  }

  const images = []
  for (const name of imageNames) {
    try {
      const img = await page.objs.get(name)
      if (img === undefined || img.data === undefined) continue
      if (img.width * img.height > MAX_PDF_IMAGE_PIXELS) {
        warnings.push(`第 ${pageNumber} 页图片 ${name} 超过像素上限，已跳过`)
        continue
      }
      const png = rasterToPng(img.width, img.height, img.kind, img.data)
      images.push({ name, width: img.width, height: img.height, data: Array.from(png) })
    } catch {
      // Some XObjects resolve as SVG/patterns; skip silently.
    }
  }

  const isScan = text.length < 20 && images.length > 0
  return {
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    text,
    images,
    isScan,
  }
}

async function main() {
  const { data, maxPages } = workerData
  const warnings = []
  const task = getDocument({ data })
  const doc = await task.promise
  try {
    const pages = []
    const toParse = Math.min(doc.numPages, maxPages)
    if (doc.numPages > maxPages) {
      warnings.push(`文档共 ${doc.numPages} 页，仅解析前 ${maxPages} 页`)
    }
    for (let n = 1; n <= toParse; n++) {
      const page = await extractPage(doc, n, warnings)
      if (page !== undefined) pages.push(page)
    }
    parentPort.postMessage({
      ok: true,
      result: { format: 'pdf', pageCount: doc.numPages, pages, warnings },
    })
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    await task.destroy()
  }
}

main()
