import { createBoardRenderer } from '../../render/index.js'

// The shared board renderer emits presentation SVG with no hit targets, and its
// output is snapshot-tested, so interactivity is added as a separate overlay
// layer rather than by changing what the renderer draws.
function cellsOf(layout) {
  if (typeof layout.getCells === 'function') return layout.getCells()
  return layout.cells || []
}

export function hitTargetLayer(layout, opts = {}) {
  const radius = opts.radius || null
  const parts = ['<g class="hit-targets" fill="transparent" stroke="none">']

  for (const cell of cellsOf(layout)) {
    const r = radius || cellRadius(cell)
    parts.push(
      `<circle class="hit-target" data-cell="${cell.key}" ` +
      `cx="${cell.center.x}" cy="${cell.center.y}" r="${r}" ` +
      `style="cursor:pointer"/>`
    )
  }

  parts.push('</g>')
  return parts.join('\n')
}

function cellRadius(cell) {
  const attrs = cell.attrs || {}
  const base = attrs.width || attrs.r || attrs.rx || 20
  return base * 0.45
}

export function overlayLayer(layout, marks = []) {
  if (marks.length === 0) return ''
  const byKey = new Map(cellsOf(layout).map(c => [String(c.key), c]))
  const parts = ['<g class="overlay" pointer-events="none">']

  for (const mark of marks) {
    const cell = byKey.get(String(mark.key))
    if (!cell) continue
    const r = cellRadius(cell)
    if (mark.type === 'target') {
      parts.push(`<circle cx="${cell.center.x}" cy="${cell.center.y}" r="${r * 0.35}" fill="${mark.color || 'rgba(0,0,0,0.25)'}"/>`)
    } else if (mark.type === 'selected') {
      parts.push(`<rect x="${cell.center.x - r}" y="${cell.center.y - r}" width="${r * 2}" height="${r * 2}" fill="none" stroke="${mark.color || '#f5c542'}" stroke-width="3"/>`)
    } else if (mark.type === 'last') {
      parts.push(`<circle cx="${cell.center.x}" cy="${cell.center.y}" r="${r}" fill="none" stroke="${mark.color || 'rgba(100,180,255,0.8)'}" stroke-width="2"/>`)
    } else if (mark.type === 'dead') {
      parts.push(`<line x1="${cell.center.x - r / 2}" y1="${cell.center.y - r / 2}" x2="${cell.center.x + r / 2}" y2="${cell.center.y + r / 2}" stroke="#d11a1a" stroke-width="2"/>`)
      parts.push(`<line x1="${cell.center.x + r / 2}" y1="${cell.center.y - r / 2}" x2="${cell.center.x - r / 2}" y2="${cell.center.y + r / 2}" stroke="#d11a1a" stroke-width="2"/>`)
    } else if (mark.type === 'territory') {
      parts.push(`<rect x="${cell.center.x - r * 0.3}" y="${cell.center.y - r * 0.3}" width="${r * 0.6}" height="${r * 0.6}" fill="${mark.color || 'rgba(0,0,0,0.35)'}"/>`)
    }
  }

  parts.push('</g>')
  return parts.join('\n')
}

export function renderInteractiveBoard(layout, options = {}) {
  const {
    pieces = {},
    marks = [],
    colors = {},
    theme = null,
    labels = true,
    padding = 20,
    interactive = true,
  } = options

  const renderer = createBoardRenderer({ padding })
  const base = renderer.render(layout, { pieces, labels, colors, theme })

  const extras = [overlayLayer(layout, marks)]
  if (interactive) extras.push(hitTargetLayer(layout))

  const injected = extras.filter(Boolean).join('\n')
  if (!injected) return base

  const close = base.lastIndexOf('</svg>')
  if (close === -1) return base
  return base.slice(0, close) + '\n' + injected + '\n' + base.slice(close)
}

export function marksForState(controllerState, legalTargets = []) {
  const marks = []
  if (controllerState.selected !== null && controllerState.selected !== undefined) {
    marks.push({ key: controllerState.selected, type: 'selected' })
  }
  const last = controllerState.lastMove
  if (last && last.to !== null && last.to !== undefined) {
    marks.push({ key: last.to, type: 'last' })
  }
  for (const target of legalTargets) {
    marks.push({ key: target, type: 'target' })
  }
  return marks
}
