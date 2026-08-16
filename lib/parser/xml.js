/**
 * Thin XML helpers over fast-xml-parser tuned for OOXML parts: namespaced tags
 * are kept verbatim (`w:p`, `a:t`, …), attributes land under `@_`, and text
 * stays a raw string. Traversal helpers normalize single-vs-array children so
 * callers never branch on arity.
 */
import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    removeNSPrefix: false,
    // Entity expansion is bounded: OOXML parts carry no DOCTYPE, so internal
    // entities are attacker-controlled input. Explicit caps stop expansion
    // bombs while keeping legitimate (long) text working.
    processEntities: {
        enabled: true,
        maxEntitySize: 10_000,
        maxExpansionDepth: 20,
        maxTotalExpansions: 10_000,
        maxExpandedLength: 8 * 1024 * 1024,
        maxEntityCount: 1_000,
    },
});
/** Parse an XML string into a node tree. Throws on malformed XML. */
export function parseXml(xml) {
    return parser.parse(xml);
}
/** Normalize a possibly-absent or single value into an array. */
export function asArray(value) {
    if (value === undefined || value === null)
        return [];
    return Array.isArray(value) ? value : [value];
}
/** Tags whose text content is not part of the visible document text. */
const SKIPPED_TEXT_TAGS = new Set(['rPh', 'a:rPr', 'w:rPr', 'w:pPr', 'a:pPr']);
/** Collect an element's children for text extraction, skipping non-visible subtrees. */
function textChildren(record) {
    const out = [];
    for (const [tag, value] of Object.entries(record)) {
        if (tag.startsWith('@_') || tag === '#text' || SKIPPED_TEXT_TAGS.has(tag))
            continue;
        if (Array.isArray(value))
            out.push(...value);
        else
            out.push(value);
    }
    return out;
}
/** Read the text content of a node: a bare string, `#text`, or concatenated `t`/`r:t` descendants. */
export function nodeText(node) {
    if (node === undefined || node === null)
        return '';
    if (typeof node === 'string')
        return node;
    if (Array.isArray(node)) {
        // Some generators emit repeated runs as an array under the same tag
        // (e.g. `a:t` appearing twice in one paragraph); concatenate in order
        // instead of stringifying the array.
        return node.map(nodeText).join('');
    }
    if (typeof node !== 'object')
        return String(node);
    const record = node;
    if (typeof record['#text'] === 'string')
        return record['#text'];
    // Rich-text runs (`w:r`/`a:r`) nest `t` under `r`; a run's text is the concat of its `t` children.
    const direct = [];
    for (const tag of ['w:t', 'a:t']) {
        direct.push(...asArray(record[tag]));
    }
    if (direct.length > 0)
        return direct.map(nodeText).join('');
    // Deep fallback: concat every descendant in document order. Iterative
    // (explicit index-based stack) so adversarial deep nesting cannot overflow
    // the call stack while preserving document order.
    const out = [];
    const stack = [];
    stack.push({ children: textChildren(record), index: 0 });
    while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.index >= top.children.length) {
            stack.pop();
            continue;
        }
        const current = top.children[top.index];
        top.index += 1;
        if (current === undefined || current === null)
            continue;
        if (typeof current === 'string') {
            out.push(current);
            continue;
        }
        if (Array.isArray(current)) {
            // Nested arrays (e.g. multiple `a:r` collapsed) — recurse elementwise.
            out.push(nodeText(current));
            continue;
        }
        if (typeof current !== 'object') {
            out.push(String(current));
            continue;
        }
        const sub = current;
        if (typeof sub['#text'] === 'string') {
            out.push(sub['#text']);
            continue;
        }
        stack.push({ children: textChildren(sub), index: 0 });
    }
    return out.join('');
}
/** First element child with the exact tag (arrays flattened), or undefined. */
export function child(node, tag) {
    return asArray(node?.[tag])[0];
}
/** Every element child with the exact tag (arrays flattened). */
export function children(node, tag) {
    return asArray(node?.[tag]);
}
/** Attribute value by name (attributes are stored under `@_<name>`). */
export function attr(node, name) {
    const record = node;
    const value = record?.[`@_${name}`];
    return typeof value === 'string' ? value : undefined;
}
/**
 * Depth-first walk over parsed XML nodes, invoking `visit(tag, value)` for
 * every element child (including bare-string text leaves such as
 * `<w:t>文本</w:t>`). Attribute maps (`@_*`) and `#text` are skipped.
 * Iterative (explicit stack), so adversarial deep nesting cannot overflow
 * the call stack.
 */
export function walk(node, visit) {
    const stack = [];
    pushChildren(node, stack);
    while (stack.length > 0) {
        const entry = stack.pop();
        if (entry === undefined)
            break;
        visit(entry.tag, entry.node);
        if (typeof entry.node === 'object' && entry.node !== null && !Array.isArray(entry.node)) {
            pushChildren(entry.node, stack);
        }
    }
}
/** Push a node's element children onto the walk stack (reverse for document order). */
function pushChildren(node, stack) {
    if (node === undefined || node === null || typeof node !== 'object' || Array.isArray(node))
        return;
    const record = node;
    const entries = [];
    for (const [tag, value] of Object.entries(record)) {
        if (tag.startsWith('@_') || tag === '#text')
            continue;
        if (Array.isArray(value)) {
            for (const item of value)
                entries.push({ tag, node: item });
        }
        else {
            entries.push({ tag, node: value });
        }
    }
    // Push in reverse so the first child is visited first (document order).
    for (let i = entries.length - 1; i >= 0; i--) {
        stack.push(entries[i]);
    }
}
