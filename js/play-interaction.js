const SVG_NS = 'http://www.w3.org/2000/svg'

export function bindBoardInteraction(container, cells, { onCellClick, hover = true }) {
  let hoverEl = null

  function findCellFromEvent(e) {
    let el = e.target
    while (el && el !== container) {
      if (el.getAttribute && el.getAttribute('data-sq')) return el
      el = el.parentNode
    }
    return null
  }

  container.onclick = (e) => {
    const cell = findCellFromEvent(e)
    if (!cell) return
    const idx = cells.toIndex(cell.getAttribute('data-sq'))
    if (idx >= 0 && onCellClick) onCellClick(idx)
  }

  if (hover) {
    container.onmouseover = (e) => {
      const cell = findCellFromEvent(e)
      if (!cell) return
      if (hoverEl) { hoverEl.remove(); hoverEl = null }
      const bbox = cell.getBBox ? cell.getBBox() : null
      if (!bbox) return
      const el = document.createElementNS(SVG_NS, 'rect')
      el.setAttribute('x', bbox.x)
      el.setAttribute('y', bbox.y)
      el.setAttribute('width', bbox.width)
      el.setAttribute('height', bbox.height)
      el.setAttribute('fill', 'rgba(100, 180, 255, 0.15)')
      el.setAttribute('pointer-events', 'none')
      el.setAttribute('class', 'board-cell-hover')
      cell.parentNode.insertBefore(el, cell.nextSibling)
      hoverEl = el
    }

    container.onmouseout = (e) => {
      if (!hoverEl) return
      const related = e.relatedTarget
      if (related && container.contains(related)) return
      hoverEl.remove()
      hoverEl = null
    }
  }

  return function dispose() {
    container.onclick = null
    container.onmouseover = null
    container.onmouseout = null
    if (hoverEl) { hoverEl.remove(); hoverEl = null }
  }
}
