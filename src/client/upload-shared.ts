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

/** Upload one file via XMLHttpRequest (reports upload progress). */
export async function uploadFile(
  sessionId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ path: string; name: string }> {
  const data = await fileToBase64(file)
  return new Promise((resolveBody, rejectBody) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/looklook-upload')
    xhr.setRequestHeader('content-type', 'application/json')
    // Upload progress: the request body is the base64 payload.
    if (onProgress !== undefined) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { ok?: boolean; path?: string; error?: string }
          if (body.ok !== true || body.path === undefined) {
            rejectBody(new Error(body.error ?? `上传失败（HTTP ${xhr.status}）`))
            return
          }
          resolveBody({ path: body.path, name: file.name })
        } catch {
          rejectBody(new Error('上传响应解析失败'))
        }
      } else {
        rejectBody(new Error(`上传失败（HTTP ${xhr.status}）`))
      }
    }
    xhr.onerror = () => rejectBody(new Error('上传失败：网络错误'))
    xhr.onabort = () => rejectBody(new Error('上传已取消'))
    xhr.send(JSON.stringify({ sessionId, name: file.name, data }))
  })
}
