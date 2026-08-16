/**
 * .psd reader: parses a Photoshop document with psd.js (pure JS, no native
 * dependencies), extracting the document header, the layer tree (groups,
 * names, sizes, visibility, text content), and per-layer RGBA pixel data for
 * transparent PNG extraction. The composite preview image is also exposed so
 * a vision model can describe the whole design.
 */

import { createRequire } from 'node:module'
import type { ParsedPsd, PsdNode, PsdLayerImage } from './psd-types.ts'

const require = createRequire(import.meta.url)
// psd.js is CommonJS; its Node entry exports { fromBuffer, fromFile, open }.
// It has no bundled types, so the API is declared here narrowly.
interface PsdImage {
  width(): number
  height(): number
  /** RGBA pixel bytes (width × height × 4). */
  pixelData: Uint8Array
}
interface PsdLayer {
  image?: PsdImage
  width?: number
  height?: number
  opacity?: number
  visible?: boolean
  top?: number
  left?: number
}
interface PsdTreeNode {
  type: 'root' | 'group' | 'layer'
  name?: string | null
  visible?: boolean
  /** Child nodes; a method on psd.js nodes. */
  children?: () => PsdTreeNode[]
  get(key: string): unknown
  layer?: PsdLayer
}
interface PsdDocument {
  header: { width: number; height: number; colorModeName?: string }
  parse(): void
  tree(): PsdTreeNode
  image: PsdImage
}
interface PsdModule {
  fromBuffer(data: Uint8Array): PsdDocument
}
const PSD: PsdModule = require('psd.js') as PsdModule

/** Hard cap on one layer's pixel count when loading its raster. */
const MAX_LAYER_PIXELS = 40_000_000

/** Hard cap on the composite preview pixels when the caller wants it. */
const MAX_PREVIEW_PIXELS = 40_000_000

/** Parse a .psd file into its structure and metadata. Layer rasters load lazily. */
export function parsePsd(data: Uint8Array): ParsedPsd {
  const psd = PSD.fromBuffer(data)
  psd.parse()

  const warnings: string[] = []
  const header = psd.header
  const root = psd.tree()

  // Resolution lives in the tree export's document resources.
  let resolution: number | undefined
  const exported = (root as unknown as { export?: () => unknown }).export?.()
  const doc = exported as { document?: { resources?: { resolutionInfo?: { h_res?: number } } } } | undefined
  resolution = doc?.document?.resources?.resolutionInfo?.h_res

  const tree: PsdNode[] = []
  let layerCount = 0
  for (const child of nodeChildren(root)) {
    walkTree(child, tree, 0, warnings, (node) => {
      if (node.type === 'layer') layerCount += 1
    })
  }

  return {
    format: 'psd',
    width: header.width,
    height: header.height,
    ...resolution !== undefined && resolution > 0 ? { resolution } : {},
    ...header.colorModeName !== undefined && header.colorModeName.length > 0 ? { colorMode: header.colorModeName } : {},
    layerCount,
    tree,
    warnings,
  }
}

/** Convert one tree node (recursively) into the plain PsdNode model. */
function walkTree(
  node: PsdTreeNode,
  out: PsdNode[],
  depth: number,
  warnings: string[],
  onLayer: (node: PsdNode) => void,
): void {
  if (depth > 32) {
    warnings.push('图层树嵌套过深，已截断')
    return
  }
  const name = typeof node.name === 'string' ? node.name : ''
  if (node.type === 'group') {
    const children: PsdNode[] = []
    const group: PsdNode = {
      type: 'group',
      name,
      visible: node.visible !== false,
      children,
    }
    for (const child of nodeChildren(node)) {
      walkTree(child, children, depth + 1, warnings, onLayer)
    }
    if (children.length > 0) out.push(group)
    return
  }
  const layer: PsdNode = {
    type: 'layer',
    name,
    visible: node.visible !== false,
    ...node.layer?.top !== undefined ? { top: node.layer.top } : {},
    ...node.layer?.left !== undefined ? { left: node.layer.left } : {},
  }
  // Text content from the Type Tool data. psd.js exposes it via node.get(),
  // whose result is an object with `obj.textValue`.
  const typeTool = node.get('typeTool') as { obj?: { textValue?: string } } | undefined
  const text = typeTool?.obj?.textValue
  if (typeof text === 'string' && text.length > 0) layer.text = text
  // Layer size comes from the raster when available, else the layer record.
  const image = node.layer?.image
  if (image !== undefined) {
    layer.width = image.width()
    layer.height = image.height()
  } else {
    const rawWidth = node.layer?.width
    const rawHeight = node.layer?.height
    if (typeof rawWidth === 'number') layer.width = rawWidth
    if (typeof rawHeight === 'number') layer.height = rawHeight
  }
  const opacity = node.layer?.opacity
  if (typeof opacity === 'number') layer.opacity = opacity
  onLayer(layer)
  out.push(layer)
}

/**
 * Load one layer's RGBA raster for transparent PNG extraction.
 * @param tree - the tree node to extract (must be a layer).
 * @returns the raster, or undefined when the layer has no raster or exceeds caps.
 */
export function loadLayerImage(tree: PsdTreeNode, warning: (msg: string) => void): PsdLayerImage | undefined {
  const image = tree.layer?.image
  if (image === undefined) {
    warning(`图层「${tree.name ?? ''}」没有可提取的像素数据`)
    return undefined
  }
  const width = image.width()
  const height = image.height()
  if (width * height > MAX_LAYER_PIXELS) {
    warning(`图层「${tree.name ?? ''}」尺寸 ${width}x${height} 超过像素上限（${MAX_LAYER_PIXELS}），已跳过提取`)
    return undefined
  }
  return { width, height, pixelData: image.pixelData }
}

/**
 * Extract one named layer from a PSD as a transparent PNG.
 * @param data - the PSD file bytes.
 * @param layerName - the exact layer name to extract.
 * @returns the PNG bytes, or an error message when the layer is missing or cannot be rasterized.
 */
export function extractLayerPng(data: Uint8Array, layerName: string): { ok: true; png: Uint8Array; width: number; height: number } | { ok: false; error: string } {
  const psd = PSD.fromBuffer(data)
  psd.parse()
  const tree = psd.tree()
  const node = findRawLayer(tree, layerName)
  if (node === undefined) return { ok: false, error: `找不到图层「${layerName}」` }
  const warnings: string[] = []
  const raster = loadLayerImage(node, (msg) => warnings.push(msg))
  if (raster === undefined) {
    return { ok: false, error: warnings[0] ?? `图层「${layerName}」没有可提取的像素数据` }
  }
  const png = encodePng(raster.width, raster.height, raster.pixelData)
  return { ok: true, png, width: raster.width, height: raster.height }
}

/** Depth-first search for a raw tree node by exact layer name. */
function findRawLayer(node: PsdTreeNode, name: string): PsdTreeNode | undefined {
  if (node.type === 'layer' && node.name === name) return node
  for (const child of nodeChildren(node)) {
    const found = findRawLayer(child, name)
    if (found !== undefined) return found
  }
  return undefined
}

/** Resolve a tree node's children, tolerating both method and array forms. */
function nodeChildren(node: PsdTreeNode): PsdTreeNode[] {
  const children = node.children
  if (typeof children === 'function') {
    const result = children.call(node)
    return Array.isArray(result) ? result : []
  }
  return []
}

/**
 * Load the composite (merged) preview raster for vision description.
 */
export function loadCompositePreview(data: Uint8Array, warning: (msg: string) => void): PsdLayerImage | undefined {
  const psd = PSD.fromBuffer(data)
  psd.parse()
  const width = psd.image.width()
  const height = psd.image.height()
  if (width * height > MAX_PREVIEW_PIXELS) {
    warning(`文档尺寸 ${width}x${height} 超过预览上限（${MAX_PREVIEW_PIXELS} 像素），已跳过整体预览`)
    return undefined
  }
  return { width, height, pixelData: psd.image.pixelData }
}

/** Encode RGBA pixels to a PNG byte buffer (transparent background preserved). */
export function encodePng(width: number, height: number, pixelData: Uint8Array): Uint8Array {
  const pngjs = require('pngjs') as {
    PNG: new (options: { width: number; height: number }) => { data: Buffer }
  }
  const png = new pngjs.PNG({ width, height })
  // PNG#data is a Buffer; copy our RGBA bytes in.
  png.data.set(Buffer.from(pixelData))
  const sync = (pngjs.PNG as unknown as { sync: { write(png: unknown): Buffer } }).sync
  return new Uint8Array(sync.write(png))
}
