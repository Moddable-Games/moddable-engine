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

const EFFECT_FALLBACK = { stroke: 'rgba(255,200,50,0.7)', fill: 'rgba(255,200,50,0.1)' }

const effectRegistry = new Map()

function registerEffects(map) {
  for (const [type, appearance] of Object.entries(map)) {
    effectRegistry.set(type, appearance)
  }
}

registerEffects({
  immune: { stroke: 'rgba(100,200,255,0.7)', fill: 'rgba(100,200,255,0.1)' },
  petrified: { stroke: 'rgba(128,128,128,0.8)', fill: 'rgba(128,128,128,0.2)' },
  poison: { stroke: 'rgba(100,255,100,0.7)', fill: 'rgba(100,255,100,0.1)' },
})

export function paintEffect(overlay, bbox, effect) {
  if (!bbox) return
  const colors = effectRegistry.get(effect.type) || EFFECT_FALLBACK
  if (!effectRegistry.has(effect.type)) {
    console.warn(`[play-overlays] Unknown effect type "${effect.type}" — using fallback marker`)
  }
  const rect = document.createElementNS(SVG_NS, 'rect')
  rect.setAttribute('x', bbox.x + 2)
  rect.setAttribute('y', bbox.y + 2)
  rect.setAttribute('width', bbox.width - 4)
  rect.setAttribute('height', bbox.height - 4)
  rect.setAttribute('rx', 4)
  rect.setAttribute('fill', colors.fill)
  rect.setAttribute('stroke', colors.stroke)
  rect.setAttribute('stroke-width', 2)
  overlay.appendChild(rect)
}

export function createOverlay(className = 'highlights') {
  const g = document.createElementNS(SVG_NS, 'g')
  g.setAttribute('class', className)
  g.setAttribute('pointer-events', 'none')
  return g
}
