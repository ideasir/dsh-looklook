/**
 * .xlsx reader: enumerates workbook sheets in order, extracts each sheet's
 * cell grid (shared strings, inline strings, numbers, formulas' cached values,
 * booleans), aligns cells by their column reference so sparse rows keep their
 * positions, and expands merged cells to their anchor value. Embedded images
 * are resolved through the sheet's drawing part into `xl/media/*`.
 */
import { readPartText, resolveRelationship, mediaTypeForPart } from "./package.js";
import { parseXml, asArray, nodeText, attr, child, children, walk } from "./xml.js";
/** Built-in numFmtIds that render as dates (per OOXML spec, §18.8.30). */
const DATE_NUMFMT_IDS = new Set([
    14, 15, 16, 17, 18, 19, 20, 21, 22, // built-in date/time formats
    45, 46, 47, // built-in time/datetime
]);
/** Convert an Excel serial date (days since 1899-12-30) to an ISO date string. */
function excelSerialToDate(serial) {
    if (!Number.isFinite(serial) || serial <= 0)
        return undefined;
    // Excel epoch: 1899-12-30 (leap-year bug handled by using 30th).
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const date = new Date(ms);
    if (Number.isNaN(date.getTime()))
        return undefined;
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
/** Whether a cell renders as a date, given its `s` (style index) and workbook numFmts. */
function isDateCell(cell, dateStyles) {
    const styleAttr = attr(cell, 's');
    if (styleAttr === undefined || styleAttr.length === 0)
        return false;
    const styleIndex = Number.parseInt(styleAttr, 10);
    return Number.isFinite(styleIndex) && dateStyles.has(styleIndex);
}
/**
 * Collect the set of cell-style indices that render as dates, from
 * `xl/styles.xml` (`cellXfs` → `numFmtId`, plus custom `numFmts`).
 */
function dateStyleIndices(pkg) {
    const indices = new Set();
    const xml = readPartText(pkg, 'xl/styles.xml');
    if (xml === undefined)
        return indices;
    const root = parseXml(xml);
    const styles = child(root, 'styleSheet') ?? root;
    // Custom formats: numFmtId → format code (only need to know it is a date).
    const customDateIds = new Set();
    const numFmts = child(styles, 'numFmts');
    for (const fmt of children(numFmts, 'numFmt')) {
        const id = attr(fmt, 'numFmtId');
        const code = attr(fmt, 'formatCode');
        if (id === undefined || code === undefined)
            continue;
        const idNum = Number.parseInt(id, 10);
        if (Number.isFinite(idNum) && /[ymdhs]/iu.test(code.replaceAll('"', ''))) {
            customDateIds.add(idNum);
        }
    }
    // cellXfs: style index → numFmtId.
    const cellXfs = child(styles, 'cellXfs');
    let index = 0;
    for (const xf of children(cellXfs, 'xf')) {
        const numFmtIdRaw = attr(xf, 'numFmtId');
        if (numFmtIdRaw !== undefined) {
            const numFmtId = Number.parseInt(numFmtIdRaw, 10);
            if (Number.isFinite(numFmtId) && (DATE_NUMFMT_IDS.has(numFmtId) || customDateIds.has(numFmtId))) {
                indices.add(index);
            }
        }
        index += 1;
    }
    return indices;
}
/** Shared string table (`xl/sharedStrings.xml`), resolved once per workbook. */
class SharedStrings {
    items = [];
    constructor(pkg) {
        const xml = readPartText(pkg, 'xl/sharedStrings.xml');
        if (xml === undefined)
            return;
        const root = parseXml(xml);
        const sst = child(root, 'sst') ?? root;
        for (const si of children(sst, 'si')) {
            // An `si` is either plain `<t>text</t>` or rich runs `<r><t>…</t></r>`.
            this.items.push(nodeText(si).replace(/\s+$/u, ''));
        }
    }
    get(index) {
        return this.items[index] ?? '';
    }
}
/** Image registry mirroring docx's; shared across sheets. */
class SheetImages {
    byPart = new Map();
    images = [];
    /**
     * Resolve a drawing rId (inside a sheet part) to its media images.
     * @returns every image index anchored in the drawing, in blip order.
     */
    resolveAll(pkg, sheetPart, rId, location) {
        const drawingPart = resolveRelationship(pkg, sheetPart, rId);
        if (drawingPart === undefined)
            return [];
        // The drawing part lists blip rIds; resolve each through the drawing rels.
        const drawingXml = readPartText(pkg, drawingPart);
        if (drawingXml === undefined)
            return [];
        const drawingDoc = parseXml(drawingXml);
        const refs = [];
        collectBlipRefs(drawingDoc, refs);
        const indices = [];
        for (const blipRId of refs) {
            const part = resolveRelationship(pkg, drawingPart, blipRId);
            if (part === undefined)
                continue;
            const index = this.add(pkg, part, location);
            if (index !== undefined)
                indices.push(index);
        }
        return indices;
    }
    add(pkg, part, location) {
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
/** Collect every `a:blip` `r:embed` value in a drawing subtree. */
function collectBlipRefs(node, out) {
    walk(node, (tag, element) => {
        if (tag === 'a:blip') {
            const rId = attr(element, 'r:embed');
            if (rId !== undefined && rId.length > 0)
                out.push(rId);
        }
    });
}
/** Parse one cell node into its display value. */
function cellValue(cell, shared, dateStyles) {
    const type = attr(cell, 't');
    const valueNode = child(cell, 'v');
    const raw = nodeText(valueNode).replace(/\s+$/u, '');
    if (type === 's') {
        const index = Number.parseInt(raw, 10);
        return shared.get(Number.isFinite(index) ? index : -1);
    }
    if (type === 'inlineStr') {
        return nodeText(cell).replace(/\s+$/u, '');
    }
    if (type === 'b')
        return raw === '1' ? 'TRUE' : 'FALSE';
    if (type === 'str')
        return raw;
    // Plain numeric (or empty): a date-styled numeric renders as a date.
    if (type === 'n' || type === undefined || raw.length === 0) {
        if (raw.length > 0 && isDateCell(cell, dateStyles)) {
            const serial = Number.parseFloat(raw);
            const iso = excelSerialToDate(serial);
            if (iso !== undefined)
                return iso;
        }
        return raw;
    }
    return raw;
}
/** Convert a column letter reference (`A`, `AB`) to a 0-based column index. */
function columnIndex(ref) {
    let index = 0;
    for (const ch of ref) {
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90)
            index = index * 26 + (code - 64);
        else
            break;
    }
    return index - 1;
}
/**
 * Parse one row's cells into a grid row aligned to the sheet's columns.
 * Excel omits empty cells entirely (`r="A1"` and `r="C1"` can be adjacent),
 * so cells must be placed by their column reference or the grid misaligns.
 */
function rowCells(row, shared, dateStyles) {
    const values = [];
    for (const cell of children(row, 'c')) {
        const ref = attr(cell, 'r') ?? '';
        const col = columnIndex(ref);
        if (col >= 0) {
            // Pad any skipped columns so sparse rows keep their alignment.
            while (values.length < col)
                values.push('');
            values[col] = cellValue(cell, shared, dateStyles);
        }
        else {
            // No usable reference: fall back to sequential placement.
            values.push(cellValue(cell, shared, dateStyles));
        }
    }
    return values;
}
/**
 * Expand merged-cell anchors across a sheet grid: every cell inside a merged
 * range takes the anchor's (top-left) value, mirroring what Excel displays.
 * @param rows - the parsed row grid (aligned to columns).
 * @param mergeRefs - raw merged range references (`A1:C1`, `B2:D4`).
 */
function expandMergedCells(rows, mergeRefs) {
    for (const ref of mergeRefs) {
        const [topLeft, bottomRight] = ref.split(':');
        if (topLeft === undefined || bottomRight === undefined)
            continue;
        const [startRow, startCol] = parseCellRef(topLeft);
        const [endRow, endCol] = parseCellRef(bottomRight);
        if (startRow < 0 || startCol < 0 || endRow < startRow || endCol < startCol)
            continue;
        const anchor = rows[startRow]?.[startCol] ?? '';
        for (let row = startRow; row <= endRow && row < rows.length; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const rowArr = rows[row];
                if (rowArr !== undefined && col < rowArr.length)
                    rowArr[col] = anchor;
            }
        }
    }
}
/** Parse an `A1`-style reference into [rowIndex, colIndex] (0-based). */
function parseCellRef(ref) {
    const match = /^([A-Z]+)(\d+)$/u.exec(ref);
    if (match === null)
        return [-1, -1];
    const col = columnIndex(match[1] ?? '');
    const row = Number.parseInt(match[2] ?? '', 10) - 1;
    return [Number.isFinite(row) ? row : -1, col];
}
/** Collect merged-range references from a worksheet node (`mergeCells/mergeCell`). */
function mergedCellRefs(ws) {
    const refs = [];
    walk(ws, (tag, element) => {
        if (tag === 'mergeCell') {
            const ref = attr(element, 'ref');
            if (ref !== undefined && ref.length > 0)
                refs.push(ref);
        }
    });
    return refs;
}
/** Enumerate workbook sheets in presentation order. */
function listSheets(pkg) {
    const xml = readPartText(pkg, 'xl/workbook.xml');
    if (xml === undefined)
        return [];
    const root = parseXml(xml);
    const wb = child(root, 'workbook') ?? root;
    const sheets = child(wb, 'sheets');
    const out = [];
    for (const sheet of children(sheets, 'sheet')) {
        const name = attr(sheet, 'name') ?? '';
        const rId = attr(sheet, 'r:id');
        if (rId === undefined)
            continue;
        const target = resolveRelationship(pkg, 'xl/workbook.xml', rId);
        if (target === undefined)
            continue;
        out.push({ name, part: target });
    }
    return out;
}
/**
 * Parse a .xlsx package into sheet sections and images.
 * @param pkg - the loaded OOXML package.
 * @returns the parsed document (one section per sheet).
 */
export function parseXlsx(pkg) {
    const warnings = [];
    const images = new SheetImages();
    const sections = [];
    const shared = new SharedStrings(pkg);
    const dateStyles = dateStyleIndices(pkg);
    const sheets = listSheets(pkg);
    if (sheets.length === 0) {
        warnings.push('未找到任何工作表');
    }
    for (const sheet of sheets) {
        const xml = readPartText(pkg, sheet.part);
        if (xml === undefined) {
            warnings.push(`工作表「${sheet.name}」缺少内容部件 ${sheet.part}`);
            continue;
        }
        const root = parseXml(xml);
        const ws = child(root, 'worksheet') ?? root;
        const sheetData = child(ws, 'sheetData') ?? ws;
        // Row → cell grid, tracking the widest row to pad short rows.
        const rows = [];
        const refs = [];
        const drawingRId = findSheetDrawingRId(ws);
        if (drawingRId !== undefined) {
            refs.push(...images.resolveAll(pkg, sheet.part, drawingRId, `工作表「${sheet.name}」`));
        }
        const mergeRefs = mergedCellRefs(ws);
        for (const row of children(sheetData, 'row')) {
            const values = rowCells(row, shared, dateStyles);
            // Trim trailing empty cells so the grid renders cleanly.
            while (values.length > 0 && values[values.length - 1] === '')
                values.pop();
            if (values.length > 0)
                rows.push(values);
        }
        if (mergeRefs.length > 0)
            expandMergedCells(rows, mergeRefs);
        if (rows.length === 0 && refs.length === 0)
            continue;
        const text = rows.map(row => row.join('\t')).join('\n');
        sections.push({
            kind: 'sheet',
            title: sheet.name,
            text,
            rows,
            ...refs.length > 0 ? { imageRefs: refs } : {},
        });
    }
    return { format: 'xlsx', sections, images: images.list(), warnings };
}
/** Find the sheet's drawing relationship id (`<drawing r:id="…">`), if any. */
function findSheetDrawingRId(ws) {
    const drawing = child(ws, 'drawing');
    const node = asArray(drawing)[0];
    return node === undefined ? undefined : attr(node, 'r:id');
}
