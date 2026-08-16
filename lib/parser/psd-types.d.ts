/**
 * PSD parse-result model. Everything is plain JSON-friendly data so the tool
 * can render it to the model and a caller can extract single layers.
 */
/** One layer or group node in the PSD tree. */
export interface PsdNode {
    /** `group` for folder nodes, `layer` for leaf layers. */
    type: 'group' | 'layer';
    /** Node name (layer/folder name). */
    name: string;
    /** Pixel dimensions; groups may lack a fixed size. */
    width?: number;
    height?: number;
    /** Position within the canvas (0-based). */
    top?: number;
    left?: number;
    /** Whether the layer is visible. */
    visible: boolean;
    /** Layer opacity 0..255 (255 = fully opaque). */
    opacity?: number;
    /** Text content for text layers; absent otherwise. */
    text?: string;
    /** Child nodes for groups. */
    children?: PsdNode[];
}
/** Extracted layer pixel data ready for PNG encoding. */
export interface PsdLayerImage {
    width: number;
    height: number;
    /** RGBA pixel bytes (width × height × 4). */
    pixelData: Uint8Array;
}
/** The complete parse result of one PSD file. */
export interface ParsedPsd {
    format: 'psd';
    /** Canvas width in pixels. */
    width: number;
    /** Canvas height in pixels. */
    height: number;
    /** Horizontal resolution in dpi, when declared. */
    resolution?: number;
    /** Color mode name (RGB, CMYK, Grayscale, …). */
    colorMode?: string;
    /** Total layer/group count (leaf layers only). */
    layerCount: number;
    /** Root-level children of the layer tree. */
    tree: PsdNode[];
    /** Non-fatal parse notes. */
    warnings: string[];
}
