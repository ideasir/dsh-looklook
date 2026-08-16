/**
 * Thin XML helpers over fast-xml-parser tuned for OOXML parts: namespaced tags
 * are kept verbatim (`w:p`, `a:t`, …), attributes land under `@_`, and text
 * stays a raw string. Traversal helpers normalize single-vs-array children so
 * callers never branch on arity.
 */
/** An XML element node: attribute map under `@_`, text under `#text` or a bare string, children by tag. */
export type XmlNode = Record<string, unknown>;
/** Parse an XML string into a node tree. Throws on malformed XML. */
export declare function parseXml(xml: string): XmlNode;
/** Normalize a possibly-absent or single value into an array. */
export declare function asArray(value: unknown): unknown[];
/** Read the text content of a node: a bare string, `#text`, or concatenated `t`/`r:t` descendants. */
export declare function nodeText(node: unknown): string;
/** First element child with the exact tag (arrays flattened), or undefined. */
export declare function child(node: unknown, tag: string): unknown;
/** Every element child with the exact tag (arrays flattened). */
export declare function children(node: unknown, tag: string): unknown[];
/** Attribute value by name (attributes are stored under `@_<name>`). */
export declare function attr(node: unknown, name: string): string | undefined;
/**
 * Depth-first walk over parsed XML nodes, invoking `visit(tag, value)` for
 * every element child (including bare-string text leaves such as
 * `<w:t>文本</w:t>`). Attribute maps (`@_*`) and `#text` are skipped.
 * Iterative (explicit stack), so adversarial deep nesting cannot overflow
 * the call stack.
 */
export declare function walk(node: unknown, visit: (tag: string, value: unknown) => void): void;
