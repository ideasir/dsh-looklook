/**
 * .pdf reader: dispatches parsing to a dedicated worker_thread (pdf-worker.mjs)
 * running pdf.js, because pdf.js's legacy build crashes on a second
 * getDocument() in the same thread (fake-worker LoopbackPort bug). Isolating
 * each parse in a fresh thread also keeps large-document parsing off the main
 * event loop. Extracts per-page text and embedded raster images (encoded to
 * PNG); pages with little text but real imagery are flagged as scans.
 */

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import type { ParsedPdf } from './pdf-types.ts'

/** Hard cap on the number of pages parsed per call. */
export const MAX_PDF_PAGES = 100

/** Absolute path of the worker entry (bundled next to this module). */
const WORKER_URL = new URL('./pdf-worker.mjs', import.meta.url)

/** Result envelope posted back by the worker. */
interface WorkerResult {
  ok: true
  result: ParsedPdf
}
interface WorkerFailure {
  ok: false
  error: string
}

/**
 * Parse a PDF file into per-page text and image extractions, running in a
 * dedicated worker thread.
 * @param data - the PDF bytes.
 * @param maxPages - page cap; defaults to MAX_PDF_PAGES.
 * @returns the parsed document.
 */
export async function parsePdf(data: Uint8Array, maxPages: number = MAX_PDF_PAGES): Promise<ParsedPdf> {
  return new Promise<ParsedPdf>((resolve, reject) => {
    const worker = new Worker(fileURLToPath(WORKER_URL), {
      workerData: { data, maxPages },
    })
    const timer = setTimeout(() => {
      worker.terminate()
      reject(new Error('PDF 解析超时'))
    }, 120_000)
    worker.once('message', (message: WorkerResult | WorkerFailure) => {
      clearTimeout(timer)
      if (message.ok) {
        resolve(message.result)
      } else {
        reject(new Error(message.error))
      }
    })
    worker.once('error', (error) => {
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    })
    worker.once('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`PDF 解析进程异常退出（code ${code}）`))
    })
  })
}
