/**
 * .docx reader: walks `word/document.xml` in reading order, extracting
 * paragraphs, headings (by paragraph style), tables (row/cell grid), and
 * inline images (drawings anchored in paragraphs or cells). Header/footer
 * parts are appended as trailing sections. Images are resolved through
 * `word/_rels/document.xml.rels` into `word/media/*` parts.
 */
import { readPartText, resolveRelationship, mediaTypeForPart } from "./package.js";
import { parseXml, asArray, nodeText, attr, child, children, walk } from "./xml.js";
/** Paragraph style names treated as headings. */
const HEADING_STYLES = new Set(['Heading1', 'Heading2', 'Heading3', 'Heading4', 'Heading5', 'Heading6', 'Title', 'Subtitle']);
/** One image registry shared across body and header/footer parsing. */
class ImageRegistry {
    byPart = new Map();
    images = [];
    /** Resolve one `r:embed`/`r:id` to an image, registering it once per package part. */
    resolve(pkg, relsPart, rId, location) {
        const part = resolveRelationship(pkg, relsPart, rId);
        if (part === undefined)
            return undefined;
        const existing = this.byPart.get(part);
        if (existing !== undefined)
            return existing.index;
        const bytes = pkg.entries.get(part);
        if (bytes === undefined)
            return undefined;
        const image = {
            index: this.images.length,
            location,
            mediaType: mediaTypeForPart(part),
            data: bytes,
            name: part.split('/').at(-1),
        };
        this.byPart.set(part, image);
        this.images.push(image);
        return image.index;
    }
    list() {
        return this.images;
    }
}
/** Find every image reference (`a:blip r:embed` or `v:imagedata r:id`) in a subtree. */
function findImageRefs(node) {
    const refs = [];
    walk(node, (tag, element) => {
        if (tag === 'a:blip' || tag === 'v:imagedata') {
            const rId = attr(element, 'r:embed') ?? attr(element, 'r:id');
            if (rId !== undefined && rId.length > 0)
                refs.push(rId);
        }
    });
    return refs;
}
/** Extract plain text from one paragraph node (runs, tabs, breaks, hyperlinks). */
function paragraphText(paragraph) {
    let text = '';
    walk(paragraph, (tag, element) => {
        // Revision-deleted text lives in `w:delText` (not `w:t`); skipping it
        // keeps deleted content out of the visible paragraph text.
        if (tag === 'w:delText' || tag === 'w:delInstrText')
            return;
        if (tag === 'w:t') {
            const t = nodeText(element);
            if (t.length > 0)
                text += t;
        }
        else if (tag === 'w:tab') {
            text += '\t';
        }
        else if (tag === 'w:br') {
            text += '\n';
        }
    });
    return text.replace(/\s+$/u, '');
}
/** Parse a table into a cell grid, collecting image refs per cell. */
function tableRows(pkg, relsPart, table, images, location) {
    const rows = [];
    const refs = [];
    for (const tr of children(table, 'w:tr')) {
        const row = [];
        for (const tc of children(tr, 'w:tc')) {
            const cellText = nodeText(tc);
            for (const rId of findImageRefs(tc)) {
                const index = images.resolve(pkg, relsPart, rId, location);
                if (index !== undefined && !refs.includes(index))
                    refs.push(index);
            }
            row.push(cellText.replace(/\s+/gu, ' ').trim());
        }
        rows.push(row);
    }
    return { rows, refs };
}
/**
 * Parse a .docx package into sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (body sections, then headers/footers).
 */
export function parseDocx(pkg) {
    const warnings = [];
    const images = new ImageRegistry();
    const sections = [];
    const bodyPart = readPartText(pkg, 'word/document.xml');
    if (bodyPart === undefined) {
        warnings.push('缺少 word/document.xml 正文部件');
        return { format: 'docx', sections, images: images.list(), warnings };
    }
    const doc = parseXml(bodyPart);
    const body = child(doc, 'w:document') ?? doc;
    const bodyNode = child(body, 'w:body') ?? body;
    let paragraphIndex = 0;
    let tableIndex = 0;
    for (const [tag, value] of Object.entries(bodyNode)) {
        if (tag.startsWith('@_') || tag === '#text')
            continue;
        if (tag === 'w:p') {
            for (const p of asArray(value)) {
                paragraphIndex += 1;
                const text = paragraphText(p);
                const style = paragraphStyle(p);
                const refs = findImageRefs(p).map(rId => images.resolve(pkg, 'word/document.xml', rId, `第 ${paragraphIndex} 段`)).filter((i) => i !== undefined);
                if (text.length === 0 && refs.length === 0)
                    continue;
                const kind = HEADING_STYLES.has(style) ? 'heading' : 'paragraph';
                sections.push({
                    kind,
                    text,
                    ...refs.length > 0 ? { imageRefs: refs } : {},
                });
            }
        }
        else if (tag === 'w:tbl') {
            for (const table of asArray(value)) {
                tableIndex += 1;
                const location = `第 ${tableIndex} 个表格`;
                const { rows, refs } = tableRows(pkg, 'word/document.xml', table, images, location);
                if (rows.length === 0 && refs.length === 0)
                    continue;
                const text = rows.map(row => row.join('\t')).join('\n');
                sections.push({
                    kind: 'table',
                    text,
                    rows,
                    ...refs.length > 0 ? { imageRefs: refs } : {},
                });
            }
        }
        else if (tag === 'w:sectPr') {
            // Section properties: no content; skip.
        }
    }
    // Headers and footers referenced from the body's section properties.
    const headerFooterParts = findHeaderFooterParts(pkg, bodyPart);
    for (const part of headerFooterParts) {
        const xml = readPartText(pkg, part);
        if (xml === undefined)
            continue;
        const partDoc = parseXml(xml);
        const root = child(partDoc, 'w:hdr') ?? child(partDoc, 'w:ftr') ?? partDoc;
        const label = part.includes('header') ? '页眉' : '页脚';
        const refs = findImageRefs(root).map(rId => images.resolve(pkg, part, rId, label)).filter((i) => i !== undefined);
        const text = nodeText(root).replace(/\s+/gu, ' ').trim();
        if (text.length === 0 && refs.length === 0)
            continue;
        sections.push({
            kind: 'paragraph',
            title: label,
            text,
            ...refs.length > 0 ? { imageRefs: refs } : {},
        });
    }
    return { format: 'docx', sections, images: images.list(), warnings };
}
/** Resolve the paragraph's `w:pStyle` value, if any. */
function paragraphStyle(paragraph) {
    let style = '';
    walk(paragraph, (tag, element) => {
        if (tag === 'w:pStyle') {
            style = attr(element, 'w:val') ?? '';
        }
    });
    return style;
}
/** Enumerate header/footer parts referenced from the body's sectPr elements. */
function findHeaderFooterParts(pkg, documentXml) {
    const parts = new Set();
    const doc = parseXml(documentXml);
    const body = child(doc, 'w:document') ?? doc;
    const bodyNode = child(body, 'w:body') ?? body;
    // Collect every sectPr's header/footer references (XML-parsed, so any
    // namespace prefix and attribute order works).
    walk(bodyNode, (tag, element) => {
        if (tag === 'w:headerReference' || tag === 'w:footerReference') {
            const rId = attr(element, 'r:id');
            if (rId === undefined)
                return;
            const target = resolveRelationship(pkg, 'word/document.xml', rId);
            if (target !== undefined)
                parts.add(target);
        }
    });
    // Fallback: enumerate word/header*.xml / word/footer*.xml parts directly
    // when the rels did not resolve any references.
    if (parts.size === 0) {
        for (const path of pkg.entries.keys()) {
            if (/^word\/(header|footer)\d+\.xml$/u.test(path))
                parts.add(path);
        }
    }
    return [...parts].sort();
}
