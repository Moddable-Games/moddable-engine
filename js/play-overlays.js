const SVG_NS = 'http://www.w3.org/2000/svg'

export function paintHighlight(overlay, bbox, color) {
  if (!bbox) return
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', bbox.x)
  rect.setAttribute('y', bbox.y)
  rect.setAttribute('width', bbox.width)
  rect.setAttribute('height', bbox.height)
  rect.setAttribute('fill', color)
  overlay.appendChild(rect)
}

export function paintIndicator(overlay, bbox, color, isCapture) {
  if (!bbox) return
  if (isCapture) {
    paintHighlight(overlay, bbox, color)
  } else {
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', bbox.x + bbox.width / 2)
    dot.setAttribute('cy', bbox.y + bbox.height / 2)
    dot.setAttribute('r', bbox.width * 0.16)
    dot.setAttribute('fill', color)
    overlay.appendChild(dot)
  }
}

export function paintFog(overlay, bbox, color = '#1a1a2e', opacity = '1') {
  if (!bbox) return
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', bbox.x)
  rect.setAttribute('y', bbox.y)
  rect.setAttribute('width', bbox.width)
  rect.setAttribute('height', bbox.height)
  rect.setAttribute('fill', color)
  rect.setAttribute('opacity', opacity)
  overlay.appendChild(rect)
}

export function createOverlay(className = 'highlights') {
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('class', className)
  g.setAttribute('pointer-events', 'none')
  return g
}
