/**
 * dsh-looklook/doc — document branch of looklook_see: Word/Excel/PPT/PDF/PSD.
 *
 * Logic per content type (not hardcoded rules — judged from the parse):
 * - .docx / .xlsx: extract text/tables; describe embedded images via the
 *   vision model when configured.
 * - .pptx: per-slide text + images; each slide's images are described IN
 *   CONTEXT of that slide's text (the "文字和图片配合" link); if the deck
 *   carries background music, the audio model identifies it ONCE (has music,
 *   style/genre, name if known) — never per-slide.
 * - .pdf: per-page text; scan pages (little text, real imagery) are
 *   described via the vision model.
 * - .psd: layer tree; optional whole-design vision description and single
 *   layer extraction as a transparent PNG attachment.
 *
 * The vision config is looklook's `vision` namespace (shared with image and
 * video recognition — no separate docreader config). Files are read through
 * the `fs` service so sandbox policy applies.
 */

import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Context } from '@deepseek-ai/cordis'
import type { VisionScope, AudioScope } from './settings.ts'
import { enabledProviders, enabledAudioProviders } from './settings.ts'
import { describeImages } from './vision-client.ts'
import { readDocument } from './parser/index.ts'
import { parsePdf, MAX_PDF_PAGES } from './parser/pdf.ts'
import type { ParsedPdf } from './parser/pdf-types.ts'
import { parsePsd, loadCompositePreview, encodePng, extractLayerPng } from './parser/index.ts'
import type { ParsedPsd, PsdNode } from './parser/index.ts'
import type { ParsedDocument, ExtractedImage } from './parser/index.ts'
import { bytesMatchMediaType } from './parser/package.ts'
import { chatCompletionsUrl } from './vision-client.ts'

// ── Limits (mirroring the vendored reader's safety bounds) ──

const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
const MAX_PDF_BYTES = 256 * 1024 * 1024
const MAX_PSD_BYTES = 128 * 1024 * 1024
const MAX_OUTPUT_CHARS = 20_000

/** Media types the OpenAI-compatible vision endpoints accept as base64 input. */
const VISION_CAPABLE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Max images sent to the vision provider in one tool call. */
const MAX_VISION_IMAGES = 20

/** Max total bytes sent to the vision provider in one tool call. */
const MAX_VISION_BYTES = 20 * 1024 * 1024

// ── Shared helpers ──

async function resolveApiKeyOf(ctx: Context): Promise<(ref: string) => Promise<string | undefined>> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return async () => undefined
  return async (ref: string) => {
    try {
      return (await credentials.resolve(credentialRef(ref)))?.value
    } catch {
      return undefined
    }
  }
}

/** Read a file through the `fs` service (sandbox policy applies). */
async function readFileBytes(
  ctx: Context,
  path: string,
  cwd: string | undefined,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ displayPath: string; data: Uint8Array }> {
  const fs = ctx.get('fs') as {
    resolve(path: string, opts: { cwd?: string; signal: AbortSignal }): Promise<{ displayPath: string }>
    stat(target: { displayPath: string }, signal: AbortSignal): Promise<{ type: string } | undefined>
    readBytes(target: { displayPath: string }, signal: AbortSignal, max: number): Promise<Uint8Array>
  }
  if (fs === undefined) throw new Error('fs 服务不可用')
  const target = await fs.resolve(path, { ...cwd === undefined ? {} : { cwd }, signal })
  const info = await fs.stat(target, signal)
  if (info === undefined) throw new Error(`无法读取 "${target.displayPath}"：文件不存在`)
  if (info.type !== 'file') throw new Error(`无法读取 "${target.displayPath}"：不是普通文件`)
  const data = await fs.readBytes(target, signal, maxBytes)
  return { displayPath: target.displayPath, data }
}

// ── Image description (shared by Office + PDF) ──

/** Describe every extracted image; returns index → text and a warning. */
async function describeImagesOf(
  ctx: Context,
  visionScope: VisionScope,
  images: ReadonlyArray<{ index: number; mediaType: string; data: Uint8Array; location: string }>,
  signal: AbortSignal,
): Promise<{ descriptions: Map<number, string>; warning: string | undefined }> {
  const providers = enabledProviders(visionScope)
  if (providers.length === 0) {
    return {
      descriptions: new Map(),
      warning: images.length > 0 ? '未配置视觉模型，文档内嵌图片未识别（可在插件设置中配置视觉模型）' : undefined,
    }
  }
  const resolveApiKey = await resolveApiKeyOf(ctx)
  const descriptions = new Map<number, string>()
  let unsupported = 0
  let mismatched = 0
  let skippedByCap = 0
  let bytesUsed = 0
  let sent = 0
  for (const image of images) {
    if (signal.aborted) break
    if (!VISION_CAPABLE_MEDIA_TYPES.has(image.mediaType)) {
      unsupported += 1
      continue
    }
    if (!bytesMatchMediaType(image.data, image.mediaType)) {
      mismatched += 1
      continue
    }
    if (sent >= MAX_VISION_IMAGES || bytesUsed + image.data.byteLength > MAX_VISION_BYTES) {
      skippedByCap += 1
      continue
    }
    const result = await describeImages(providers, resolveApiKey, [{
      mediaType: image.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
      data: image.data,
    }], 2000, signal)
    if (result.ok) {
      descriptions.set(image.index, result.text)
      sent += 1
      bytesUsed += image.data.byteLength
    } else if (result.code !== 'unconfigured') {
      descriptions.set(image.index, `（识别失败：${result.message}）`)
    }
  }
  const warnings: string[] = []
  if (unsupported > 0) warnings.push(`${unsupported} 张图片为矢量图或未支持格式，未做视觉识别`)
  if (mismatched > 0) warnings.push(`${mismatched} 张图片内容与扩展名不符，未做视觉识别`)
  if (skippedByCap > 0) warnings.push(`${skippedByCap} 张图片超过单次识别上限，未做视觉识别`)
  return { descriptions, warning: warnings.length > 0 ? warnings.join('；') : undefined }
}

// ── PPT background music (audio model, once, deck-level) ──

/** Identify PPT background music via the audio model (one call, not per-slide). */
async function identifyBackgroundMusic(
  ctx: Context,
  audioScope: AudioScope,
  audio: { mediaType: string; data: Uint8Array; name?: string },
  signal: AbortSignal,
): Promise<string | undefined> {
  const providers = enabledAudioProviders(audioScope)
  const provider = providers[0]
  if (provider === undefined) return undefined
  const resolveApiKey = await resolveApiKeyOf(ctx)
  const apiKey = await resolveApiKey(provider.apiKeyEnv)
  if (apiKey === undefined) return undefined
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('audio timeout')), provider.timeoutMs ?? 60_000)
  const upstream = signal.aborted ? signal : AbortSignal.any([signal, controller.signal])
  try {
    const base64 = Buffer.from(audio.data).toString('base64')
    const format = audio.mediaType.includes('mp3') ? 'mp3' : audio.mediaType.includes('m4a') ? 'm4a' : 'wav'
    const response = await fetch(chatCompletionsUrl(provider.baseURL), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: upstream,
      body: JSON.stringify({
        model: provider.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `这是演示文稿中的背景音乐${audio.name !== undefined ? `（文件 ${audio.name}）` : ''}。请识别：1) 是否有音乐 2) 音乐类型/风格（如钢琴/管弦乐/电子/流行）3) 节奏氛围 4) 若知道曲名请说出。简洁回答，不需要逐页分析。` },
            { type: 'input_audio', input_audio: { data: base64, format } },
          ],
        }],
      }),
    })
    if (!response.ok) return undefined
    const body = await response.json() as { choices?: Array<{ message?: Record<string, unknown> }> }
    const message = body.choices?.[0]?.message
    for (const field of ['content', 'reasoning']) {
      const value = message?.[field]
      if (typeof value === 'string' && value.trim() !== '') return value.trim()
    }
    return undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

// ── Office (docx/xlsx/pptx) ──

/** Render a bounded digest; images are described IN CONTEXT of their section. */
function renderOfficeDigest(
  doc: ParsedDocument,
  descriptions: ReadonlyMap<number, string>,
  maxChars: number,
): string {
  const lines: string[] = []
  const formatLabel: Record<string, string> = { docx: 'Word 文档', xlsx: 'Excel 表格', pptx: 'PPT 演示文稿' }
  lines.push(`# 文档内容（${formatLabel[doc.format] ?? doc.format}）`)
  if (doc.sections.length === 0) lines.push('（未提取到文本内容）')
  for (const section of doc.sections) {
    const prefix = section.kind === 'heading' ? '## ' : section.kind === 'table' || section.kind === 'sheet' || section.kind === 'slide' ? '### ' : ''
    const title = section.title === undefined ? '' : ` ${section.title}`
    const block: string[] = []
    if (prefix.length > 0 || title.length > 0) block.push(`${prefix}${title}`.trim())
    if (section.text.length > 0) block.push(section.text)
    for (const ref of section.imageRefs ?? []) {
      const image = doc.images[ref]
      if (image === undefined) continue
      const sizeKb = Math.max(1, Math.round(image.data.byteLength / 1024))
      const header = `[图片] · ${image.mediaType} · ${sizeKb} KB · 位置：${image.location}`
      const desc = descriptions.get(ref)
      block.push(desc !== undefined && desc.length > 0 ? `${header}\n图片内容：${desc}` : header)
    }
    if (block.length > 0) lines.push(block.join('\n'))
  }
  if (doc.images.length > 0) {
    lines.push('')
    lines.push('---')
    lines.push(`共提取 ${doc.images.length} 张图片`)
  }
  if (doc.audios !== undefined && doc.audios.length > 0) {
    lines.push('')
    lines.push(`共检测到 ${doc.audios.length} 段背景音乐`)
  }
  if (doc.warnings.length > 0) {
    lines.push('')
    lines.push('---')
    lines.push('解析提示：')
    for (const warning of doc.warnings) lines.push(`- ${warning}`)
  }
  return lines.join('\n').slice(0, maxChars)
}

// ── PDF ──

function renderPdfDigest(parsed: ParsedPdf, descriptions: ReadonlyMap<number, string>, maxChars: number): string {
  const lines: string[] = []
  lines.push('# PDF 文档内容')
  lines.push(`共 ${parsed.pageCount} 页${parsed.pages.length < parsed.pageCount ? `（已解析前 ${parsed.pages.length} 页）` : ''}`)
  for (const page of parsed.pages) {
    const header = `第 ${page.pageNumber} 页 · ${Math.round(page.width)}×${Math.round(page.height)}pt · ${page.images.length} 张图${page.isScan ? ' · ⚠️ 疑似扫描页' : ''}`
    lines.push('')
    lines.push(`## ${header}`)
    if (page.text.length > 0) {
      lines.push(page.text)
    } else if (page.isScan) {
      lines.push('（本页无可提取文本，图片已送视觉识别）')
    }
    const description = descriptions.get(page.pageNumber)
    if (description !== undefined && description.length > 0) {
      lines.push(`图片识别：${description}`)
    }
  }
  return lines.join('\n').slice(0, maxChars)
}

// ── PSD ──

function renderPsdDigest(psd: ParsedPsd, overallDescription: string | undefined, maxChars: number): string {
  const lines: string[] = []
  lines.push('# PSD 文档分析')
  lines.push(`- 画布：${psd.width} × ${psd.height}px${psd.resolution !== undefined ? `（${psd.resolution}dpi）` : ''}`)
  if (psd.colorMode !== undefined) lines.push(`- 色彩模式：${psd.colorMode}`)
  lines.push(`- 图层总数：${psd.layerCount}`)
  if (overallDescription !== undefined && overallDescription.length > 0) {
    lines.push('')
    lines.push(`## 整体内容\n${overallDescription}`)
  }
  lines.push('')
  lines.push('## 图层结构')
  if (psd.tree.length === 0) lines.push('（空文档）')
  for (const node of psd.tree) renderPsdNode(node, 0, lines)
  return lines.join('\n').slice(0, maxChars)
}

function renderPsdNode(node: PsdNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth)
  const visibility = node.visible ? '' : '（隐藏）'
  const dims = node.width !== undefined && node.height !== undefined ? ` · ${node.width}×${node.height}` : ''
  if (node.type === 'group') {
    out.push(`${indent}- 📁 ${node.name}${visibility}`)
    for (const childNode of node.children ?? []) renderPsdNode(childNode, depth + 1, out)
    return
  }
  const kind = node.text !== undefined ? '✏️' : '🖼️'
  const text = node.text !== undefined ? ` · 文本：${node.text.replaceAll('\n', ' ').slice(0, 80)}` : ''
  out.push(`${indent}- ${kind} ${node.name}${dims}${text}${visibility}`)
}

// ── Document branch entry ──

const DOC_EXTENSIONS = ['.docx', '.xlsx', '.pptx', '.pdf', '.psd'] as const

/** Whether a source path is a document file looklook_see should route here. */
export function isDocumentPath(path: string): boolean {
  const lower = path.toLowerCase()
  return DOC_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * Read and analyze a document file — the document branch of looklook_see.
 * @param source - the document file path.
 * @param question - the user's question (passed through, model-facing).
 * @returns the digest text (or a failure message).
 */
export async function readDocumentFile(
  ctx: Context,
  visionScope: VisionScope,
  audioScope: AudioScope,
  source: string,
  question: string,
  cwd: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  const lower = source.toLowerCase()
  try {
    if (lower.endsWith('.pdf')) {
      const { displayPath, data } = await readFileBytes(ctx, source, cwd, MAX_PDF_BYTES, signal)
      const parsed = await parsePdf(data, MAX_PDF_PAGES)
      const descriptions = new Map<number, string>()
      const providers = enabledProviders(visionScope)
      if (providers.length > 0) {
        const resolveApiKey = await resolveApiKeyOf(ctx)
        for (const page of parsed.pages) {
          if (signal.aborted) break
          if (!page.isScan || page.images.length === 0) continue
          const inputs = page.images
            .slice(0, 4)
            .map(image => ({ mediaType: 'image/png' as const, data: image.data }))
          if (inputs.length === 0) continue
          const result = await describeImages(providers, resolveApiKey, inputs, 2000, signal)
          if (result.ok) descriptions.set(page.pageNumber, result.text)
        }
      }
      const digest = renderPdfDigest(parsed, descriptions, MAX_OUTPUT_CHARS)
      return `${digest}\n\n【用户问题】${question}`
    }

    if (lower.endsWith('.psd')) {
      const { displayPath, data } = await readFileBytes(ctx, source, cwd, MAX_PSD_BYTES, signal)
      const psd = parsePsd(data)
      const warnings = [...psd.warnings]
      let overallDescription: string | undefined
      const providers = enabledProviders(visionScope)
      if (providers.length > 0 && psd.width * psd.height <= 40_000_000) {
        const resolveApiKey = await resolveApiKeyOf(ctx)
        const preview = loadCompositePreview(data, (msg) => warnings.push(msg))
        if (preview !== undefined) {
          const result = await describeImages(providers, resolveApiKey, [{
            mediaType: 'image/png',
            data: encodePng(preview.width, preview.height, preview.pixelData),
          }], 2000, signal)
          if (result.ok) overallDescription = result.text
        }
      }
      const digest = renderPsdDigest(psd, overallDescription, MAX_OUTPUT_CHARS)
      return `${digest}\n\n【用户问题】${question}`
    }

    // Office (docx/xlsx/pptx)
    const { displayPath, data } = await readFileBytes(ctx, source, cwd, MAX_DOCUMENT_BYTES, signal)
    const doc = await readDocument(data, displayPath)
    const { descriptions, warning: describeWarning } = await describeImagesOf(ctx, visionScope, doc.images, signal)
    const warnings = describeWarning === undefined ? doc.warnings : [...doc.warnings, describeWarning]

    // PPT background music: identify once via the audio model.
    let musicNote: string | undefined
    if (doc.audios !== undefined && doc.audios.length > 0) {
      const firstAudio = doc.audios[0]
      if (firstAudio !== undefined) {
        const music = await identifyBackgroundMusic(ctx, audioScope, firstAudio, signal)
        if (music !== undefined) musicNote = `【背景音乐】${music}`
      }
    }

    let digest = renderOfficeDigest(doc, descriptions, MAX_OUTPUT_CHARS)
    if (musicNote !== undefined) digest = `${digest}\n\n${musicNote}`
    return `${digest}\n\n【用户问题】${question}`
  } catch (error) {
    return `读取文档失败：${error instanceof Error ? error.message : String(error)}`
  }
}
