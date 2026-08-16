/**
 * .psd reader: parses a Photoshop document with psd.js (pure JS, no native
 * dependencies), extracting the document header, the layer tree (groups,
 * names, sizes, visibility, text content), and per-layer RGBA pixel data for
 * transparent PNG extraction. The composite preview image is also exposed so
 * a vision model can describe the whole design.
 */
import type { ParsedPsd, PsdLayerImage } from './psd-types.ts';
interface PsdImage {
    width(): number;
    height(): number;
    /** RGBA pixel bytes (width × height × 4). */
    pixelData: Uint8Array;
}
interface PsdLayer {
    image?: PsdImage;
    width?: number;
    height?: number;
    opacity?: number;
    visible?: boolean;
    top?: number;
    left?: number;
}
interface PsdTreeNode {
    type: 'root' | 'group' | 'layer';
    name?: string | null;
    visible?: boolean;
    /** Child nodes; a method on psd.js nodes. */
    children?: () => PsdTreeNode[];
    get(key: string): unknown;
    layer?: PsdLayer;
}
/** Parse a .psd file into its structure and metadata. Layer rasters load lazily. */
export declare function parsePsd(data: Uint8Array): ParsedPsd;
/**
 * Load one layer's RGBA raster for transparent PNG extraction.
 * @param tree - the tree node to extract (must be a layer).
 * @returns the raster, or undefined when the layer has no raster or exceeds caps.
 */
export declare function loadLayerImage(tree: PsdTreeNode, warning: (msg: string) => void): PsdLayerImage | undefined;
/**
 * Extract one named layer from a PSD as a transparent PNG.
 * @param data - the PSD file bytes.
 * @param layerName - the exact layer name to extract.
 * @returns the PNG bytes, or an error message when the layer is missing or cannot be rasterized.
 */
export declare function extractLayerPng(data: Uint8Array, layerName: string): {
    ok: true;
    png: Uint8Array;
    width: number;
    height: number;
} | {
    ok: false;
    error: string;
};
/**
 * Load the composite (merged) preview raster for vision description.
 */
export declare function loadCompositePreview(data: Uint8Array, warning: (msg: string) => void): PsdLayerImage | undefined;
/** Encode RGBA pixels to a PNG byte buffer (transparent background preserved). */
export declare function encodePng(width: number, height: number, pixelData: Uint8Array): Uint8Array;
export {};
