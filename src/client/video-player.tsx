/**
 * 内置视频播放器弹窗。点击视频缩略图后打开，用标准 <video> 标签播放。
 * 支持播放/暂停、进度控制、全屏。
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.72)',
}

const maskStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
}

const videoStyle: React.CSSProperties = {
  position: 'relative',
  maxWidth: '92vw',
  maxHeight: '92vh',
  borderRadius: 8,
  boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
  background: '#000',
}

const closeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  width: 32,
  height: 32,
  display: 'grid',
  placeItems: 'center',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.14)',
  color: '#fff',
  fontSize: 18,
  lineHeight: 1,
}

/**
 * 视频播放弹窗，Escape / 遮罩 / 关闭按钮均可关闭。
 */
export function VideoPlayer({ src, onClose }: {
  src: string
  onClose: () => void
}): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus()
      // 清理 blob URL
      videoRef.current?.pause()
    }
  }, [onClose])

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="视频播放">
      <div style={maskStyle} aria-hidden="true" onMouseDown={onClose} />
      <video
        ref={videoRef}
        style={videoStyle}
        src={src}
        controls
        autoPlay
        playsInline
        aria-label="视频播放器"
      />
      <button ref={closeRef} type="button" style={closeStyle} aria-label="关闭" onClick={onClose}>
        ✕
      </button>
    </div>,
    document.body,
  )
}

/** 从 File 对象生成视频缩略图的 data URL（第一帧截图）。 */
export function videoThumbnailUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.playsInline = true
    video.muted = true
    const url = URL.createObjectURL(file)
    video.src = url
    video.addEventListener('loadeddata', () => {
      // seek 到 0.5 秒（避免黑屏第一帧）
      video.currentTime = 0.5
    })
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(''); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
      URL.revokeObjectURL(url)
      resolve(dataUrl)
    })
    video.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      resolve('')
    })
    // 超时保护
    setTimeout(() => {
      URL.revokeObjectURL(url)
      resolve('')
    }, 5000)
  })
}