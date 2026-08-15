/**
 * UploadButton: the "上传文件" control in the composer tool row
 * (`conversation.input.left`). Accepts archives (.zip/.7z) and video; the
 * bytes go to the plugin's `/api/looklook-upload` route (saved into the
 * session workspace `.uploads/`), then a normal user message is sent with
 * the file path so the model can process it (process_zip / fs / bash).
 */

import { useRef, useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** Injected face supplied by the plugin apply closure. */
export interface UploadInjected {
  /** The wire API client. */
  api: IApiClient
  /** Bound translate for the `looklook` namespace. */
  t: TranslateNS<'looklook'>
  /** Reactive zip-feature flag (gate the archive button). */
  useZipEnabled: () => boolean
  /** The current session id (injected by the slot owner). */
  sessionId: string
}

/** Accepted extensions (archives + video). */
const ACCEPT = '.zip,.7z,.mp4,.mov,.avi,.mkv,.webm,.flv,.wmv,.m4v'

/** Convert a File's bytes to a base64 string (chunked to avoid stack blowups). */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/** The upload button (rendered in the composer tool row). */
export function UploadButton(props: UploadInjected) {
  const { api, t, useZipEnabled, sessionId } = props
  const zipEnabled = useZipEnabled()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setBusy(true)
    setNotice(null)
    try {
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
      // Send a normal user message carrying the file path (the model then
      // processes the file with process_zip / fs / bash).
      const sent = await api.sessions.prompt({
        sessionId: sessionId as never,
        mode: 'queue' as never,
        content: [{ type: 'text', text: t('upload.message', { name: file.name, path: body.path }) }] as never,
      } as never)
      if (!sent.result.ok) throw new Error(sent.result.error.message)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        title={t('upload.title')}
        aria-label={t('upload.title')}
        disabled={busy || !zipEnabled}
        onClick={() => inputRef.current?.click()}
        style={{
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
          width: 28,
          height: 28,
          border: 'none',
          borderRadius: 999,
          background: 'transparent',
          cursor: busy || !zipEnabled ? 'default' : 'pointer',
          color: busy || !zipEnabled ? 'var(--dsw-alias-label-tertiary)' : 'var(--dsw-alias-label-secondary)',
          opacity: busy || !zipEnabled ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l6 6h-4v8h-4v-8H6l6-6z" fill="currentColor" />
          <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={false}
        style={{ display: 'none' }}
        onChange={event => void pick(event.target.files?.[0])}
      />
      {busy && <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('upload.uploading')}</span>}
      {notice !== null && (
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-warn-label)' }}>{notice}</span>
      )}
    </span>
  )
}
