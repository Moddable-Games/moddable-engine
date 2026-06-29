/**
 * Board renderer — topology-agnostic SVG generation.
 *
 * The renderer does not know what topology it's drawing. It asks the
 * topology's layout adapter for pixel positions and cell shapes, then
 * composes SVG layers.
 *
 * The contract: topology provides a layout adapter via createLayout().
 * Layout adapters implement:
 *   - getCells() → [{key, center: {x,y}, shape: 'rect'|'hex'|'circle'|'node', ...}]
 *   - getDimensions() → {width, height}
 *   - getLines() → [{x1,y1,x2,y2}] (optional, for grid lines / connections)
 *   - getAnnotations() → [{type, ...}] (optional, for star points / markers)
 */

export function createBoardRenderer(opts = {}) {
  const { padding = 20 } = opts

  function render(layout, config = {}) {
    const { colors = {}, pieces = {}, highlights = [], labels = true } = config
    const dims = layout.getDimensions()
    const width = dims.width + padding * 2
    const height = dims.height + padding * 2

    const parts = []
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`)

    if (colors.background) {
      parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${colors.background}" rx="4"/>`)
    }

    parts.push(`<g transform="translate(${padding},${padding})">`)

    if (layout.getLines) {
      const lines = layout.getLines()
      const lineColor = colors.line || '#333'
      const lineWidth = colors.lineWidth || 1.5
      parts.push(`<g stroke="${lineColor}" stroke-width="${lineWidth}" stroke-linecap="round">`)
      for (const line of lines) {
        parts.push(`<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}"/>`)
      }
      parts.push('</g>')
    }

    const cells = layout.getCells()
    parts.push(renderCells(cells, colors, highlights))

    if (layout.getAnnotations) {
      parts.push(renderAnnotations(layout.getAnnotations(), colors))
    }

    if (Object.keys(pieces).length > 0) {
      parts.push(renderPieces(cells, pieces, colors))
    }

    if (labels && layout.getLabels) {
      parts.push(renderLabels(layout.getLabels(), colors))
    }

    parts.push('</g>')
    parts.push('</svg>')
    return parts.join('\n')
  }

  function renderCells(cells, colors, highlights) {
    const parts = []
    const highlightSet = new Set(highlights.map(h => h.key))

    for (const cell of cells) {
      const fill = highlightSet.has(cell.key)
        ? (highlights.find(h => h.key === cell.key).color || colors.highlight || '#ffff00')
        : (cell.fill || colors.cellFill || 'none')

      if (cell.shape === 'rect') {
        parts.push(`<rect x="${cell.center.x - cell.size / 2}" y="${cell.center.y - cell.size / 2}" width="${cell.size}" height="${cell.size}" fill="${fill}" stroke="${colors.cellStroke || 'none'}" stroke-width="0.5"/>`)
      } else if (cell.shape === 'hex') {
        const corners = cell.corners || []
        const points = corners.map(c => `${c.x},${c.y}`).join(' ')
        parts.push(`<polygon points="${points}" fill="${fill}" stroke="${colors.cellStroke || '#333'}" stroke-width="1"/>`)
      } else if (cell.shape === 'circle' || cell.shape === 'node') {
        const r = cell.radius || 5
        parts.push(`<circle cx="${cell.center.x}" cy="${cell.center.y}" r="${r}" fill="${fill || colors.point || '#333'}"/>`)
      } else if (cell.shape === 'pit') {
        const r = cell.radius || 20
        parts.push(`<ellipse cx="${cell.center.x}" cy="${cell.center.y}" rx="${r}" ry="${r * 0.8}" fill="${fill || colors.pitFill || '#8B4513'}" stroke="${colors.pitStroke || '#5C3010'}" stroke-width="2"/>`)
      }
    }
    return parts.join('\n')
  }

  function renderAnnotations(annotations, colors) {
    const parts = []
    for (const ann of annotations) {
      if (ann.type === 'dot') {
        parts.push(`<circle cx="${ann.x}" cy="${ann.y}" r="${ann.radius || 3}" fill="${colors.annotation || '#333'}"/>`)
      } else if (ann.type === 'label') {
        parts.push(`<text x="${ann.x}" y="${ann.y}" text-anchor="middle" dominant-baseline="central" font-size="${ann.fontSize || 10}" fill="${colors.labelText || '#333'}">${ann.text}</text>`)
      }
    }
    return parts.join('\n')
  }

  function renderPieces(cells, pieces, colors) {
    const parts = []
    parts.push('<g class="pieces">')
    for (const cell of cells) {
      const piece = pieces[cell.key]
      if (!piece) continue
      const fill = piece.color === 'white' ? (colors.whitePiece || '#fff') : (colors.blackPiece || '#1c1c1c')
      const stroke = piece.color === 'white' ? (colors.whitePieceStroke || '#333') : (colors.blackPieceStroke || '#888')
      const r = (cell.size || cell.radius || 20) * 0.35
      parts.push(`<circle cx="${cell.center.x}" cy="${cell.center.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`)
      if (piece.label) {
        parts.push(`<text x="${cell.center.x}" y="${cell.center.y}" text-anchor="middle" dominant-baseline="central" font-size="${r}" fill="${stroke}">${piece.label}</text>`)
      }
    }
    parts.push('</g>')
    return parts.join('\n')
  }

  function renderLabels(labelData, colors) {
    const parts = []
    parts.push(`<g fill="${colors.labelText || '#555'}" font-size="10" font-family="sans-serif">`)
    for (const lbl of labelData) {
      parts.push(`<text x="${lbl.x}" y="${lbl.y}" text-anchor="${lbl.anchor || 'middle'}" dominant-baseline="${lbl.baseline || 'central'}">${lbl.text}</text>`)
    }
    parts.push('</g>')
    return parts.join('\n')
  }

  return { render }
}
