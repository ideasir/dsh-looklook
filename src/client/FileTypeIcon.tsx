/**
 * FileTypeIcon — one inline SVG glyph per file-type family (zip / psd / pdf /
 * office / video / generic). Shared by the pending chips (FileChips) and the
 * sent-message attachment cards (UserMessageNodeView) so both look native and
 * consistent. No external dependencies.
 */

/** The icon glyph for one file name (by extension family). */
export function FileTypeIcon({ name, size = 20 }: { name: string; size?: number }) {
  const lower = name.toLowerCase()
  const fill = 'currentColor'
  const stroke = 'currentColor'
  if (lower.endsWith('.zip') || lower.endsWith('.7z') || lower.endsWith('.rar')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h16v12H4z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M4 8l3-4h10l3 4" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 13l6-2M9 15l6-2" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  if (lower.endsWith('.psd')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="7" cy="8" r="2.4" fill={fill} opacity="0.8" />
        <circle cx="17" cy="6.5" r="2" fill={fill} opacity="0.6" />
        <circle cx="13" cy="16" r="2.8" fill={fill} opacity="0.7" />
        <path d="M3 21l5.5-8L13 16l4-5 4 10H3z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    )
  }
  if (lower.endsWith('.pdf')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M15 3v4h4" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <text x="12" y="17" textAnchor="middle" fontSize="8" fontWeight="700" fill={fill}>PDF</text>
      </svg>
    )
  }
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="2.5" stroke={stroke} strokeWidth="1.6" />
        <path d="M8 13l2.6-3 2.4 2 2-2.5L18 13" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    )
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M15 3v4h4" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.5 14h5M9.5 17h5" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.mkv') || lower.endsWith('.webm')) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" stroke={stroke} strokeWidth="1.6" />
        <path d="M10 9.5l5 2.5-5 2.5z" fill={fill} />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15 3v4h4" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
