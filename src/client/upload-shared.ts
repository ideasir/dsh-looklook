/**
 * Shared upload logic for dsh-looklook: upload any dropped file (image,
 * archive, video) through the plugin's `remote.looklook.upload` RPC (saved
 * into the session workspace `.uploads/`) and return its path. The caller
 * stages the note into the input draft — nothing is sent until the user
 * presses Enter.
 *
 * The channel accepts EVERY extension; the client asks the host about the
 * session model's modality first and routes images to the native pipeline
 * when the model can already see them (multi-modal models stay native).
 */

/** Image extensions that ride the native DSH pipeline when the model is
 * multi-modal (they are intercepted only for text-only sessions). */
export const NATIVE_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']

/** Whether a file name is an image that can ride the native pipeline. */
export function isNativeImageName(name: string): boolean {
  const ext = extensionOf(name)
  return NATIVE_IMAGE_EXTENSIONS.includes(ext)
}

/** Whether a file name should be intercepted by the looklook upload channel
 * (i.e. it is NOT a native image; images are routed by modality at drop time). */
export function isUploadableName(name: string): boolean {
  return !isNativeImageName(name)
}

function extensionOf(name: string): string {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot) : ''
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

/** The remote surface the upload RPC lives on. */
export interface LooklookUploadRemote {
  upload?(payload: { sessionId: string; name: string; data: string }): Promise<
    { ok: boolean; value?: { ok: boolean; path?: string; name?: string; error?: string }; error?: { message?: string } }
  >
}

/** Upload one file via the authorized RPC. */
export async function uploadFile(
  remote: LooklookUploadRemote | undefined,
  sessionId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ path: string; name: string }> {
  if (remote?.upload === undefined) throw new Error('上传服务未就绪（插件宿主未加载）')
  const data = await fileToBase64(file)
  onProgress?.(30) // read done; RPC send is not progress-reportable — show movement
  const envelope = await remote.upload({ sessionId, name: file.name, data })
  onProgress?.(100)
  if (!envelope.ok) {
    throw new Error(
      typeof envelope.error === 'string'
        ? envelope.error
        : envelope.error?.message ?? '上传失败',
    )
  }
  const business = envelope.value
  if (business?.ok === true && business.path !== undefined) {
    return { path: business.path, name: business.name ?? file.name }
  }
  throw new Error(typeof business?.error === 'string' ? business.error : '上传失败')
}

/** Session modality probe result. */
export type SessionModality = { ok: true; supportsImage: boolean } | { ok: false; error: string }

/** One environment-check item (mirrors the host EnvCheckItem). */
export interface EnvCheckItem {
  id: string
  label: string
  status: 'ok' | 'missing' | 'error'
  detail: string
  repairable: boolean
  repairAction?: 'install-yt-dlp' | 'install-asr'
  guidance?: string
}

/** The full environment report (mirrors the host EnvCheckReport). */
export interface EnvCheckReport {
  ok: boolean
  items: EnvCheckItem[]
  summary: string
}

/** Human-readable byte size (B / KB / MB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 功能检测结果项（镜像宿主 CapabilityItem）。 */
export interface CapabilityItem {
  id: string
  label: string
  status: 'ok' | 'fail'
  errorReason: string
}

/** 功能检测报告（镜像宿主 CapabilityReport）。 */
export interface CapabilityReport {
  ok: boolean
  items: CapabilityItem[]
}
