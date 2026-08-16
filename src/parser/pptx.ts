/**
 * .pptx reader: enumerates slides in presentation order, extracts each slide's
 * shape texts (title, body, tables, notes via the notes slide part), and
 * resolves embedded images (`p:pic` blips) through each slide's rels into
 * `ppt/media/*`. The notes slide is appended to its slide's section.
 */

import type { ParsedDocument, DocSection, ExtractedImage, ExtractedAudio } from './types.ts'
import type { OfficePackage } from './package.ts'
import { readPartText, resolveRelationship, mediaTypeForPart } from './package.ts'
import { parseXml, asArray, nodeText, attr, child, children, walk, type XmlNode } from './xml.ts'

/** One resolved slide: its part path, notes part (may be absent), and index. */
interface SlideInfo {
  part: string
  notesPart?: string
}

/** Image registry shared across slides. */
class SlideImages {
  private readonly byPart = new Map<string, ExtractedImage>()
  private readonly images: ExtractedImage[] = []

  resolve(pkg: OfficePackage, slidePart: string, rId: string, location: string): number | undefined {
    const part = resolveRelationship(pkg, slidePart, rId)
    if (part === undefined) return undefined
    const existing = this.byPart.get(part)
    if (existing !== undefined) return existing.index
    const bytes = pkg.entries.get(part)
    if (bytes === undefined) return undefined
    const image: ExtractedImage = {
      index: this.images.length,
      location,
      mediaType: mediaTypeForPart(part),
      data: bytes,
      name: part.split('/').at(-1),
    }
    this.byPart.set(part, image)
    this.images.push(image)
    return image.index
  }

  list(): ExtractedImage[] {
    return this.images
  }
}

/** Collect every image rId (`a:blip` r:embed) in a slide subtree. */
function findSlideImageRefs(node: unknown): string[] {
  const refs: string[] = []
  walk(node, (tag, element) => {
    if (tag === 'a:blip') {
      const rId = attr(element, 'r:embed')
      if (rId !== undefined && rId.length > 0) refs.push(rId)
    }
  })
  return refs
}

/** Enumerate slides in presentation order. */
function listSlides(pkg: OfficePackage): SlideInfo[] {
  const xml = readPartText(pkg, 'ppt/presentation.xml')
  if (xml === undefined) return []
  const root = parseXml(xml)
  const presentation = child(root, 'p:presentation') ?? root
  const sldIdLst = child(presentation, 'p:sldIdLst')
  const out: SlideInfo[] = []
  for (const sldId of children(sldIdLst, 'p:sldId')) {
    const rId = attr(sldId, 'r:id')
    if (rId === undefined) continue
    const target = resolveRelationship(pkg, 'ppt/presentation.xml', rId)
    if (target === undefined) continue
    out.push({ part: target })
  }
  // Attach notes parts by resolving the notesSlide relationship from each
  // slide's own rels — notesSlide numbering is independent of slide numbering.
  for (const slide of out) {
    const notesPart = resolveNotesSlide(pkg, slide.part)
    if (notesPart !== undefined) slide.notesPart = notesPart
  }
  return out
}

/** Resolve a slide's notes-slide part via its rels (`notesSlide` relationship). */
function resolveNotesSlide(pkg: OfficePackage, slidePart: string): string | undefined {
  const relsPath = relsForPart(slidePart)
  const relsXml = readPartText(pkg, relsPath)
  if (relsXml === undefined) return undefined
  const relsRoot = parseXml(relsXml)
  const relationships = child(relsRoot, 'Relationships') ?? relsRoot
  for (const rel of children(relationships, 'Relationship')) {
    const type = attr(rel, 'Type') ?? ''
    if (!type.endsWith('/notesSlide')) continue
    const target = attr(rel, 'Target')
    if (target === undefined) continue
    return normalizeSlidePart(pkg, slidePart, target)
  }
  return undefined
}

/** Resolve a notes-slide rels target (relative or absolute) to a package part. */
function normalizeSlidePart(pkg: OfficePackage, slidePart: string, target: string): string | undefined {
  const slash = slidePart.lastIndexOf('/')
  const dir = slash >= 0 ? slidePart.slice(0, slash + 1) : ''
  const candidate = target.startsWith('/')
    ? target.replace(/^\/+/, '')
    : `${dir}${target}`
  // Normalize `..` segments and verify the part exists.
  const segments = candidate.split('/')
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(segment)
  }
  const normalized = out.join('/')
  return pkg.entries.has(normalized) ? normalized : undefined
}

/** The rels part path for a content part. */
function relsForPart(part: string): string {
  const slash = part.lastIndexOf('/')
  const dir = slash >= 0 ? part.slice(0, slash + 1) : ''
  return `${dir}_rels/${part.slice(slash + 1)}.rels`
}

/**
 * Collect embedded audio files (e.g. background music) from `ppt/media/*`.
 * Only audio extensions count; the bytes are returned as-is for the audio
 * model to interpret. Audio is deck-level (not per-slide) — that matches how
 * PPT background music is stored and keeps the report simple.
 */
function collectAudio(pkg: OfficePackage): ExtractedAudio[] {
  const audioExts = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma'])
  const audios: ExtractedAudio[] = []
  const seen = new Set<string>()
  for (const [part, bytes] of pkg.entries) {
    if (!part.startsWith('ppt/media/')) continue
    const lower = part.toLowerCase()
    const dot = lower.lastIndexOf('.')
    const ext = dot >= 0 ? lower.slice(dot) : ''
    if (!audioExts.has(ext)) continue
    if (seen.has(part)) continue
    seen.add(part)
    audios.push({
      location: '演示文稿背景音乐',
      mediaType: mediaTypeForPart(part),
      data: bytes,
      name: part.split('/').at(-1),
    })
  }
  return audios
}

/**
 * Parse a .pptx package into slide sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (one section per slide, notes appended).
 */
export function parsePptx(pkg: OfficePackage): ParsedDocument {
  const warnings: string[] = []
  const images = new SlideImages()
  const sections: DocSection[] = []
  const slides = listSlides(pkg)

  if (slides.length === 0) {
    warnings.push('未找到任何幻灯片')
  }

  let slideIndex = 0
  for (const slide of slides) {
    slideIndex += 1
    const xml = readPartText(pkg, slide.part)
    if (xml === undefined) {
      warnings.push(`第 ${slideIndex} 页幻灯片缺少内容部件 ${slide.part}`)
      continue
    }
    const root = parseXml(xml)
    const location = `第 ${slideIndex} 页`
    const refs = findSlideImageRefs(root)
      .map(rId => images.resolve(pkg, slide.part, rId, location))
      .filter((i): i is number => i !== undefined)
    const text = slideText(root)
    if (text.length === 0 && refs.length === 0) continue

    const section: DocSection = {
      kind: 'slide',
      title: `第 ${slideIndex} 页`,
      text,
      ...refs.length > 0 ? { imageRefs: refs } : {},
    }

    // Notes: append as a separate section labeled with the slide number.
    if (slide.notesPart !== undefined) {
      const notesXml = readPartText(pkg, slide.notesPart)
      if (notesXml !== undefined) {
        const notesRoot = parseXml(notesXml)
        const notesText = slideText(notesRoot).trim()
        const notesRefs = findSlideImageRefs(notesRoot)
          .map(rId => images.resolve(pkg, slide.notesPart as string, rId, `第 ${slideIndex} 页备注`))
          .filter((i): i is number => i !== undefined)
        if (notesText.length > 0 || notesRefs.length > 0) {
          sections.push({
            kind: 'notes',
            title: `第 ${slideIndex} 页备注`,
            text: notesText,
            ...notesRefs.length > 0 ? { imageRefs: notesRefs } : {},
          })
        }
      }
    }
    sections.push(section)
  }

  return { format: 'pptx', sections, images: images.list(), audios: collectAudio(pkg), warnings }
}

/** Extract the visible text from a slide/notes root, one line per `a:p` paragraph. */
function slideText(root: XmlNode): string {
  const paragraphs: string[] = []
  collectParagraphs(root, paragraphs)
  return paragraphs.join('\n').trim()
}

/** Collect each `a:p` paragraph's text in document order. */
function collectParagraphs(node: unknown, out: string[]): void {
  if (node === undefined || node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectParagraphs(item, out)
    return
  }
  const record = node as Record<string, unknown>
  for (const [tag, value] of Object.entries(record)) {
    if (tag.startsWith('@_') || tag === '#text') continue
    if (tag === 'a:p') {
      const text = nodeText(value).trim()
      if (text.length > 0) out.push(text)
    }
    collectParagraphs(value, out)
  }
}
