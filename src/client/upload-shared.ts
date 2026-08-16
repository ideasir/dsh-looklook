/**
 * Shared upload logic for dsh-looklook: upload one or more archive/video
 * files through the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`) and return their paths. The caller stages
 * the notes into the input draft — nothing is sent until the user presses
 * Enter.
 *
 * NOTE: this client-side extension list is a MIRROR of the authoritative
 * host whitelist in `src/upload.ts` (ARCHIVE_EXTENSIONS + VIDEO_EXTENSIONS).
 * Keep them in sync; the verify scripts assert equality.
 */

/** Accepted extensions (archives + video), mirroring `src/upload.ts`. */
export const ACCEPT_EXTENSIONS = ['.zip', '.7z', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v']

/** Whether a file name is uploadable through the looklook channel. */
export function isUploadableName(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPT_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/**
 * Convert a File to a base64 data string asynchronously via FileReader, so a
 * large file never blocks the UI thread with a synchronous btoa loop.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        rejectBody(new Error('读取文件失败'))
        return
      }
      const comma = result.indexOf(',')
      resolveBody(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => rejectBody(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

/** Upload one file; returns the absolute path the host saved. */
export async function uploadFile(sessionId: string, file: File): Promise<{ path: string; name: string }> {
  const data = await fileToBase64(file)
  const response = await fetch('/api/looklook-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, name: file.name, data }),
  })
  const body = await response.json() as { ok?: boolean; path?: string; error?: string }
  if (body.ok !== true || body.path === undefined) {
    throw new Error(body.error ?? `上传失败（HTTP ${response.status}）`)
  }
  return { path: body.path, name: file.name }
}
