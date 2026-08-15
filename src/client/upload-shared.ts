/**
 * Shared upload logic for dsh-looklook: upload one or more archive/video
 * files through the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`) and return their paths. The caller stages
 * the notes into the input draft — nothing is sent until the user presses
 * Enter.
 */

/** Accepted extensions (archives + video). */
export const ACCEPT_EXTENSIONS = ['.zip', '.7z', '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v']

/** Whether a file name is uploadable through the looklook channel. */
export function isUploadableName(name: string): boolean {
  const lower = name.toLowerCase()
  return ACCEPT_EXTENSIONS.some(ext => lower.endsWith(ext))
}

/** Convert a File's bytes to a base64 string (chunked to avoid stack blowups). */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
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

/**
 * Upload every file and return the saved paths WITHOUT sending anything —
 * the caller stages the note into the input draft, so nothing is sent until
 * the user presses Enter.
 * @returns the successfully saved file notes (name + path lines).
 */
export async function uploadFiles(
  sessionId: string,
  files: File[],
  buildNote: (name: string, path: string) => string,
): Promise<string[]> {
  const lines: string[] = []
  for (const file of files) {
    try {
      const { path } = await uploadFile(sessionId, file)
      lines.push(buildNote(file.name, path))
    } catch {
      // skip failed files silently; the successful ones still stage
    }
  }
  return lines
}
