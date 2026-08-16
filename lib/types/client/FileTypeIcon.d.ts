/**
 * FileTypeIcon — one inline SVG glyph per file-type family (zip / psd / pdf /
 * office / video / generic). Shared by the pending chips (FileChips) and the
 * sent-message attachment cards (UserMessageNodeView) so both look native and
 * consistent. No external dependencies.
 */
/** The icon glyph for one file name (by extension family). */
export declare function FileTypeIcon({ name, size }: {
    name: string;
    size?: number;
}): import("react").JSX.Element;
