/**
 * 内置的原图预览 Lightbox。
 *
 * rc.8 起 DSH 不再从 `@deepseek-ai/dsh-client-ui-attachment` 的包根导出
 * `ImageLightbox` / `ImageLoader` / `ImageLightboxLabels`（组件被收进内部
 * client 槽位实现，不再对外提供包级导出）。这里按 rc.8 源码的交互行为
 * 原样内置一个轻量实现（Escape / 遮罩 / 关闭按钮，body portal 渲染），
 * 不依赖 DSH 的任何内部 CSS，样式用 looklook 已有的深色主题变量。
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'

/** Lightbox 的文案（由调用方从自己的 locale 命名空间解析）。 */
export interface ImageLightboxLabels {
  /** 预览对话框的可访问名称。 */
  dialog: string
  /** 关闭控件的可访问标签。 */
  close: string
}

/** 根据附件引用加载原始图片 URL 的加载器（与 DSH rc.8 兼容）。 */
export type ImageLoader = (attachment: ImageAttachmentRef) => Promise<string>

const lightboxStyle: React.CSSProperties = {
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

const imageStyle: React.CSSProperties = {
  position: 'relative',
  maxWidth: '92vw',
  maxHeight: '92vh',
  objectFit: 'contain',
  borderRadius: 6,
  boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
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
 * 文档级原图预览，点击缩略图打开。Escape、点击遮罩或关闭按钮均可关闭，
 * 卸载时把焦点还给打开者。通过 body portal 渲染，避免祖先 transform/filter
 * 把 fixed 遮罩困在祖先盒子里。
 */
export function ImageLightbox({ src, alt, labels, onClose }: {
  src: string
  alt: string
  labels: ImageLightboxLabels
  onClose: () => void
}): ReactNode {
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
    }
  }, [onClose])

  return createPortal(
    <div style={lightboxStyle} role="dialog" aria-modal="true" aria-label={labels.dialog}>
      <div style={maskStyle} aria-hidden="true" onMouseDown={onClose} />
      <img style={imageStyle} src={src} alt={alt} />
      <button ref={closeRef} type="button" style={closeStyle} aria-label={labels.close} onClick={onClose}>
        ✕
      </button>
    </div>,
    document.body,
  )
}