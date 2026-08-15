/**
 * Shared upload logic for dsh-looklook: upload one or more archive/video
 * files through the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`), then send a normal user message carrying
 * every file path so the model can process them.
 */

import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'

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
 * Upload every file and send one user message listing the paths.
 * @returns the number of successfully uploaded files.
 */
export async function uploadAndSend(
  api: IApiClient,
  sessionId: string,
  files: File[],
  buildNote: (name: string, path: string) => string,
): Promise<{ ok: number; failed: number }> {
  const lines: string[] = []
  let failed = 0
  for (const file of files) {
    try {
      const { path } = await uploadFile(sessionId, file)
      lines.push(buildNote(file.name, path))
    } catch {
      failed += 1
    }
  }
  if (lines.length > 0) {
    const text = lines.join('\n')
    await api.sessions.prompt({
      sessionId: sessionId as never,
      mode: 'queue' as never,
      content: [{ type: 'text', text }] as never,
    } as never)
  }
  return { ok: lines.length, failed }
}
