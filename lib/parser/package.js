/**
 * OOXML package helpers: ZIP inspection via fflate plus relationship and
 * media-part resolution shared by the three format readers.
 */
import { unzip } from 'fflate';
/** Hard cap on one decompressed entry, guarding against per-entry bombs. */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
/** Hard cap on total decompressed bytes, guarding against aggregate bombs. */
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;
/** Hard cap on the number of package parts, guarding against entry floods. */
const MAX_PART_COUNT = 10_000;
/** Whether the given bytes look like an OOXML ZIP container. */
export function isZipContainer(data) {
    return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b
        && ((data[2] === 0x03 && data[3] === 0x04) || (data[2] === 0x05 && data[3] === 0x06));
}
/**
 * Decode a ZIP container into an in-memory part map. Uses fflate's streaming
 * `unzip` with a pre-decompression filter so declared entry sizes are checked
 * BEFORE bytes are materialized — a zip bomb is refused without ever
 * allocating its inflated output. Throws on corrupt or oversized input.
 */
export async function loadPackage(data) {
    const entries = new Map();
    let total = 0;
    let count = 0;
    await new Promise((resolve, reject) => {
        unzip(data, {
            filter: (file) => {
                count += 1;
                if (count > MAX_PART_COUNT) {
                    reject(new Error(`文件内部部件数量超过 ${MAX_PART_COUNT} 个，已中止解析`));
                    return false;
                }
                if (file.originalSize > MAX_ENTRY_BYTES) {
                    reject(new Error(`文件内单个部件解压后超过 ${Math.round(MAX_ENTRY_BYTES / 1024 / 1024)}MB 上限，已中止解析`));
                    return false;
                }
                total += file.originalSize;
                if (total > MAX_DECOMPRESSED_BYTES) {
                    reject(new Error(`文件解压后超过 ${Math.round(MAX_DECOMPRESSED_BYTES / 1024 / 1024)}MB 上限，已中止解析`));
                    return false;
                }
                return true;
            },
        }, (error, unzipped) => {
            if (error !== null && error !== undefined) {
                reject(error instanceof Error ? error : new Error(String(error)));
                return;
            }
            for (const [path, bytes] of Object.entries(unzipped)) {
                entries.set(path, bytes);
            }
            resolve();
        });
    });
    return { entries };
}
/** Read a package part as UTF-8 text; returns undefined when the part is absent. */
export function readPartText(pkg, path) {
    const bytes = pkg.entries.get(path);
    return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}
/**
 * Resolve a relationship id to its target part. OOXML stores image links as
 * `r:embed="rIdN"` inside content parts; the `<part>/_rels/<part>.rels` file
 * maps rIds to relative targets (usually under `media/`).
 */
export function resolveRelationship(pkg, partPath, rId) {
    const slash = partPath.lastIndexOf('/');
    const dir = slash >= 0 ? partPath.slice(0, slash + 1) : '';
    const relsPath = `${dir}_rels/${partPath.slice(slash + 1)}.rels`;
    const xml = readPartText(pkg, relsPath);
    if (xml === undefined)
        return undefined;
    // Match whole `<Relationship …/>` elements: attribute order is not
    // guaranteed by the format, so scanning per-element is safer than assuming
    // `Id` precedes `Target`.
    const elementRe = /<Relationship\b[^>]*\/>/gu;
    let element;
    while ((element = elementRe.exec(xml)) !== null) {
        const body = element[0];
        const idMatch = /(?:^|\s)Id="([^"]+)"/u.exec(body);
        if (idMatch === null || idMatch[1] !== rId)
            continue;
        const targetMatch = /(?:^|\s)Target="([^"]+)"/u.exec(body);
        const raw = targetMatch?.[1];
        if (raw === undefined)
            return undefined;
        const target = raw.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
        if (target.startsWith('/'))
            return normalizePartPath(target.replace(/^\/+/, ''));
        if (target.startsWith('http://') || target.startsWith('https://'))
            return undefined;
        return normalizePartPath(`${dir}${target}`);
    }
    return undefined;
}
/**
 * Normalize a package part path, resolving `..` and `.` segments so a
 * relationship target like `../media/pic1.png` inside `ppt/slides/` resolves
 * to `ppt/media/pic1.png`.
 */
function normalizePartPath(path) {
    const segments = path.split('/');
    const out = [];
    for (const segment of segments) {
        if (segment === '' || segment === '.')
            continue;
        if (segment === '..') {
            if (out.length > 0)
                out.pop();
            continue;
        }
        out.push(segment);
    }
    return out.join('/');
}
/** Infer an image media type from a package part path by extension. */
export function mediaTypeForPart(partPath) {
    const lower = partPath.toLowerCase();
    if (lower.endsWith('.png'))
        return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
        return 'image/jpeg';
    if (lower.endsWith('.gif'))
        return 'image/gif';
    if (lower.endsWith('.webp'))
        return 'image/webp';
    if (lower.endsWith('.bmp'))
        return 'image/bmp';
    if (lower.endsWith('.svg'))
        return 'image/svg+xml';
    if (lower.endsWith('.emf'))
        return 'image/emf';
    if (lower.endsWith('.wmf'))
        return 'image/x-wmf';
    if (lower.endsWith('.tif') || lower.endsWith('.tiff'))
        return 'image/tiff';
    return 'application/octet-stream';
}
/**
 * Whether the bytes match the declared media type's magic signature. Returns
 * false for a clear mismatch (e.g. an HTML file renamed to .png); unknown or
 * unverified signatures are treated as a match so legitimate files are never
 * dropped.
 */
export function bytesMatchMediaType(data, mediaType) {
    const starts = (bytes) => {
        if (data.length < bytes.length)
            return false;
        for (let i = 0; i < bytes.length; i++) {
            if (data[i] !== bytes[i])
                return false;
        }
        return true;
    };
    switch (mediaType) {
        case 'image/png':
            return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        case 'image/jpeg':
            return starts([0xff, 0xd8, 0xff]);
        case 'image/gif':
            return starts([0x47, 0x49, 0x46, 0x38]); // GIF8
        case 'image/webp':
            return data.length >= 12
                && starts([0x52, 0x49, 0x46, 0x46]) // RIFF
                && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50; // WEBP
        case 'image/bmp':
            return starts([0x42, 0x4d]); // BM
        default:
            // EMF/WMF/SVG/TIFF/unknown: do not reject on magic (SVG is text, EMF/WMF
            // signatures vary); these are filtered from vision anyway by media type.
            return true;
    }
}
