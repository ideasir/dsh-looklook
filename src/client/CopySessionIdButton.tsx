/**
 * CopySessionIdButton — a small button injected into the assistant-actions
 * slot (between copy-text and branch buttons).  Click copies the session
 * reference `dsh-session://<id>\n标题: <title>` to clipboard so the user
 * can paste it into another session or send it to another AI agent.
 */
import { useState } from 'react'

/** Props injected by the slot system (assistant-actions receives messageId). */
export interface CopySessionIdInjected {
  sessionId: string
  title: string
}

export function CopySessionIdButton(props: CopySessionIdInjected) {
  const { sessionId, title } = props
  const [copied, setCopied] = useState(false)

  const handleClick = () => {
    if (copied) return
    const ref = `dsh-session://${sessionId}`
    const text = title ? `${ref}\n标题: ${title}` : ref
    void navigator.clipboard?.writeText?.(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {
      // Fallback for non-HTTPS
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;left:-9999px'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  // Match the existing button style from MessageIconActions
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'transparent',
        border: 'none',
        padding: 0,
        transition: 'background .15s, color .15s',
      }}
      title={copied ? '已复制' : '复制会话ID'}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--dsw-alias-bg-hover)'
        e.currentTarget.style.color = 'var(--dsw-alias-label-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'
      }}
    >
      {copied
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      }
    </span>
  )
}
