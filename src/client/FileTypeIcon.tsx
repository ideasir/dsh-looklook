/**
 * FileTypeIcon — generic file icon with extension label.
 * Shows a file outline with the actual extension (ZIP, PDF, MD, EXE, etc.)
 * rendered as SVG text. Supports ANY extension automatically.
 * Uses Tabler Icons style where available (ZIP, PDF, DOC, PPT, XLS, etc.),
 * falls back to file outline + text label for everything else.
 * Source: https://tabler.io/icons — ISC license.
 */

/** Extensions that have a dedicated Tabler file-type icon. */
const TABLER_ICONS: Record<string, { paths: string[] }> = {
  zip: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M16 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M12 15v6",
      "M5 15h3l-3 6h3",
    ],
  },
  pdf: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M17 18h2",
      "M20 15h-3v6",
      "M11 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1",
    ],
  },
  docx: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M2 15v6h1a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2h-1",
      "M17 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0",
      "M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1 -3 0v-3a1.5 1.5 0 0 1 1.5 -1.5",
      "M19.5 15l3 6",
      "M19.5 21l3 -6",
    ],
  },
  ppt: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M16.5 15h3",
      "M18 15v6",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
    ],
  },
  xlsx: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2",
      "M8 11h8v7h-8l0 -7",
      "M8 15h8",
      "M11 11v7",
    ],
  },
  txt: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M16.5 15h3",
      "M4.5 15h3",
      "M6 15v6",
      "M18 15v6",
      "M10 15l4 6",
      "M10 21l4 -6",
    ],
  },
  png: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M20 15h-1a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h1v-3",
      "M5 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M11 21v-6l3 6v-6",
    ],
  },
  jpg: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M11 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M20 15h-1a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h1v-3",
      "M5 15h3v4.5a1.5 1.5 0 0 1 -3 0",
    ],
  },
  bmp: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M18 18h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M4 21h1.5a1.5 1.5 0 0 0 0 -3h-1.5h1.5a1.5 1.5 0 0 0 0 -3h-1.5v6",
      "M10 21v-6l2.5 3l2.5 -3v6",
    ],
  },
  svg: {
    paths: [
      "M14 3v4a1 1 0 0 0 1 1h4",
      "M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4",
      "M4 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75",
      "M10 15l2 6l2 -6",
      "M20 15h-1a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h1v-3",
    ],
  },
}

/** Extensions grouped by Tabler icon key. */
const EXT_TO_TABLER: Record<string, string> = {
  zip: 'zip', '7z': 'zip', rar: 'zip', tar: 'zip', gz: 'zip', xz: 'zip', bz2: 'zip', lz: 'zip', zst: 'zip',
  pdf: 'pdf',
  docx: 'docx', doc: 'docx',
  pptx: 'ppt', ppt: 'ppt', key: 'ppt', odp: 'ppt',
  xlsx: 'xlsx', xls: 'xlsx', csv: 'xlsx', tsv: 'xlsx', ods: 'xlsx',
  txt: 'txt',
  png: 'png',
  jpg: 'jpg', jpeg: 'jpg',
  bmp: 'bmp',
  svg: 'svg',
}

/** Font size scales with icon size. */
function labelSize(size: number): number {
  return Math.round(size * 0.35)
}

/** Render a generic file outline + extension label as SVG text. */
function FileWithLabel({ ext, size, sw }: { ext: string; size: number; sw: number }) {
  const label = ext.toUpperCase().slice(0, 4)
  const fs = labelSize(size)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
      <text x="12" y="16" textAnchor="middle" fontSize={fs} fontWeight="700" fill="currentColor" stroke="none">{label}</text>
    </svg>
  )
}

export function FileTypeIcon({ name, size = 20 }: { name: string; size?: number }) {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot + 1) : ''
  const sw = 2

  // First check if there's a dedicated Tabler icon
  const tablerKey = EXT_TO_TABLER[ext]
  if (tablerKey !== undefined) {
    const icon = TABLER_ICONS[tablerKey]
    if (icon) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon.paths.map((d, i) => <path key={i} d={d} />)}
        </svg>
      )
    }
  }

  // Fallback: file outline + extension label
  return <FileWithLabel ext={ext} size={size} sw={sw} />
}