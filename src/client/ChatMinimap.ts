/**
 * ChatMinimap — 滚动导航概览标尺
 *
 * 从 React store（ConversationRoot.nodes）读取完整消息列表，
 * 只显示用户消息（kind === 'user'），不受虚拟滚动影响。
 * 实时更新，点击跳转，悬停预览。
 */
let installed = false

export function installChatMinimap(): void {
  if (installed) return
  installed = true

  const wait = setInterval(() => {
    const scrollEl = document.querySelector('[class*="scrollBody"], [class*="scroller"], .Md3f7G_scroll') as HTMLElement | null
    if (!scrollEl) return
    clearInterval(wait)
    setup(scrollEl)
  }, 400)
}

function setup(scrollEl: HTMLElement): void {
  // ── 标尺容器 ──────────────────────────────────────────────
  const ruler = document.createElement('div')
  ruler.style.cssText = [
    'position:absolute', 'left:20px', 'width:16px', 'height:0',
    'z-index:10', 'pointer-events:none', 'background:transparent', 'transition:opacity .3s',
  ].join(';')
  scrollEl.appendChild(ruler)
  ruler.classList.add('looklook-minimap')

  // ── 提示浮层 ──────────────────────────────────────────────
  const tip = document.createElement('div')
  tip.style.cssText = [
    'position:fixed', 'max-width:280px', 'padding:5px 10px', 'border-radius:6px',
    'background:rgba(30,30,40,0.95)', 'border:1px solid rgba(255,255,255,0.12)',
    'color:#e5e7f0', 'font-size:12px', 'line-height:1.4', 'white-space:pre-wrap',
    'word-break:break-word', 'z-index:200', 'pointer-events:none',
    'box-shadow:0 4px 12px rgba(0,0,0,0.3)', 'display:none', 'backdrop-filter:blur(8px)',
  ].join(';')
  document.body.appendChild(tip)

  // ── 主题 ─────────────────────────────────────────────────
  function isDark(): boolean {
    return document.documentElement.classList.contains('dark') ||
      getComputedStyle(document.documentElement).getPropertyValue('color-scheme') === 'dark'
  }
  function colors() {
    return isDark()
      ? { dash: 'rgba(255,255,255,0.35)', hover: 'rgba(255,255,255,0.85)', adj: 'rgba(255,255,255,0.6)' }
      : { dash: 'rgba(0,0,0,0.25)', hover: 'rgba(0,0,0,0.8)', adj: 'rgba(0,0,0,0.55)' }
  }

  // ── 从 React store 读消息列表 ──────────────────────────────
  // 每次 refresh 都直接遍历 fiber 树，从 ConversationRoot 取 nodes
  interface Entry { key: string; preview: string }
  let entries: Entry[] = []
  let lastNodesJson = ''

  function readUserMessages(): Entry[] {
    try {
      const root = document.getElementById('root')
      if (!root) return []
      const fiberKey = Object.keys(root).find(k => k.startsWith('__reactContainer'))
      if (!fiberKey) return []
      const fiber = (root as any)[fiberKey]
      const visited = new Set<object>()
      const queue: any[] = [fiber]

      while (queue.length > 0) {
        const node = queue.shift()
        if (!node || visited.has(node)) continue
        visited.add(node)

        if (node.memoizedState) {
          let s = node.memoizedState
          let idx = 0
          while (s && idx < 40) {
            if (s.memoizedState && typeof s.memoizedState === 'object' && s.memoizedState !== null) {
              const store = s.memoizedState as Record<string, unknown>
              const nodes = store.nodes as Array<Record<string, unknown>> | undefined
              if (Array.isArray(nodes) && nodes.length > 0) {
                const first = nodes[0]
                if (first && typeof first.kind === 'string' && typeof first.seq === 'number') {
                  return nodes
                    .filter((n: Record<string, unknown>) => n.kind === 'user')
                    .map((n: Record<string, unknown>) => ({
                      key: `seq:${n.seq as number}`,
                      preview: extractPreview(n.content),
                    }))
                }
              }
            }
            s = s.next
            idx++
          }
        }

        if (node.child) queue.push(node.child)
        if (node.sibling) queue.push(node.sibling)
      }
    } catch { /* fiber 遍历可能抛异常 */ }
    return []
  }

  function extractPreview(content: unknown): string {
    try {
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === 'object' && (part as Record<string, unknown>).type === 'text') {
            const text = (part as Record<string, unknown>).text as string ?? ''
            return text.replace(/\s+/g, ' ').replace(/\[.*?\]/g, '').trim().slice(0, 60) || '…'
          }
        }
      }
    } catch { /* ignore */ }
    return '…'
  }

  // ── 渲染 ──────────────────────────────────────────────────
  const GAP = 8
  const DASH_W = 15
  const DASH_H = 3
  let dashEls: HTMLElement[] = []

  function render(entryList: Entry[]): void {
    for (const el of dashEls) if (el.parentNode) el.parentNode.removeChild(el)
    dashEls = []
    if (entryList.length === 0) { ruler.style.display = 'none'; return }
    ruler.style.display = 'block'

    const totalH = (entryList.length - 1) * GAP + DASH_H
    ruler.style.height = `${totalH}px`
    const c = colors()

    for (let i = 0; i < entryList.length; i++) {
      const entry = entryList[i]
      if (!entry) continue

      const hit = document.createElement('div')
      hit.style.cssText = [
        'position:absolute', 'left:0', `top:${i * GAP}px`,
        'width:40px', `height:${GAP + 3}px`,
        'cursor:default', 'pointer-events:auto',
      ].join(';')

      const bar = document.createElement('div')
      bar.style.cssText = [
        'position:absolute', 'left:0', 'top:0',
        `width:${DASH_W}px`, `height:${DASH_H}px`,
        'border-radius:1.5px', `background:${c.dash}`,
        'transition:width .12s, background .2s', 'pointer-events:none',
      ].join(';')
      hit.appendChild(bar)

      hit.addEventListener('mouseenter', () => {
        bar.style.width = '30px'
        bar.style.background = c.hover
        const prev = dashEls[i - 1], next = dashEls[i + 1]
        if (prev) { const pb = prev.firstChild as HTMLElement | null; if (pb) { pb.style.width = '20px'; pb.style.background = c.adj } }
        if (next) { const nb = next.firstChild as HTMLElement | null; if (nb) { nb.style.width = '20px'; nb.style.background = c.adj } }
        tip.textContent = entry.preview || '…'
        tip.style.display = 'block'
      })
      hit.addEventListener('mousemove', (ev) => {
        tip.style.left = `${Math.min(ev.clientX + 16, window.innerWidth - 300)}px`
        tip.style.top = `${Math.max(8, ev.clientY - 18)}px`
      })
      hit.addEventListener('mouseleave', () => {
        bar.style.width = `${DASH_W}px`
        bar.style.background = c.dash
        const prev = dashEls[i - 1], next = dashEls[i + 1]
        if (prev) { const pb = prev.firstChild as HTMLElement | null; if (pb) { pb.style.width = `${DASH_W}px`; pb.style.background = c.dash } }
        if (next) { const nb = next.firstChild as HTMLElement | null; if (nb) { nb.style.width = `${DASH_W}px`; nb.style.background = c.dash } }
        tip.style.display = 'none'
      })
      hit.addEventListener('click', () => {
        const ratio = i / Math.max(entryList.length - 1, 1)
        const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight
        scrollEl.scrollTop = ratio * maxScroll
      })
      ruler.appendChild(hit)
      dashEls.push(hit)
    }
  }

  // ── 位置 ──────────────────────────────────────────────────
  function updatePosition(): void {
    const r = scrollEl.getBoundingClientRect()
    const rulerH = ruler.offsetHeight || 0
    ruler.style.left = `${r.left + 20}px`
    ruler.style.top = `${Math.max(8, r.top + (r.height - rulerH) / 2)}px`
  }

  // ── 刷新 ──────────────────────────────────────────────────
  function refresh(): void {
    try {
      const updated = readUserMessages()
      const nodesJson = JSON.stringify(updated.map(e => e.key))
      if (nodesJson !== lastNodesJson) {
        lastNodesJson = nodesJson
        entries = updated
        render(entries)
      }
      updatePosition()
    } catch { /* ignore */ }
  }

  // ── 启动 ──────────────────────────────────────────────────
  // MutationObserver 监听 document.body 变化，React 渲染完成后立即读 store
  const bodyObs = new MutationObserver(() => requestAnimationFrame(refresh))
  bodyObs.observe(document.body, { childList: true, subtree: true })
  requestAnimationFrame(refresh)

  // 会话切换检测：scrollEl 被替换时重建
  const obs = new MutationObserver(() => {
    if (document.querySelector('[class*="scrollBody"]') !== scrollEl) {
      installed = false
      ruler.remove()
      tip.remove()
      obs.disconnect()
      bodyObs.disconnect()
      themeObs.disconnect()
      installChatMinimap()
      return
    }
    requestAnimationFrame(refresh)
  })
  obs.observe(scrollEl, { childList: true, subtree: true })
  window.addEventListener('resize', updatePosition)

  let wasDark = isDark()
  const themeObs = new MutationObserver(() => {
    if (isDark() !== wasDark) { wasDark = isDark(); render(entries) }
  })
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })

  window.addEventListener('beforeunload', () => {
    obs.disconnect()
    bodyObs.disconnect()
    themeObs.disconnect()
    ruler.remove()
    tip.remove()
  })
}