/**
 * Shared upload logic for dsh-looklook: upload any non-image file through the
 * plugin's `/api/looklook-upload` route (saved into the session workspace
 * `.uploads/`) and return its path. The caller stages the note into the
 * input draft — nothing is sent until the user presses Enter.
 *
 * The channel accepts EVERY extension (installing the plugin unlocks all
 * uploads); only browser-native image types are left to the DSH image
 * pipeline. This file mirrors the host route's no-whitelist policy.
 */

/** Image extensions that ride the native DSH pipeline (never intercepted). */
const NATIVE_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']

/** Whether a file name should be intercepted by the looklook upload channel
 * (i.e. it is NOT a native image). */
export function isUploadableName(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  return !NATIVE_IMAGE_EXTENSIONS.includes(ext)
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
