/**
 * Board renderer — topology-agnostic SVG generation.
 *
 * The renderer does not know what topology it's drawing. It asks the
 * topology's layout adapter for pixel positions and SVG element data,
 * then composes SVG layers.
 *
 * The contract: topology provides a layout adapter via getLayout().
 * Layout adapters implement:
 *   - getCells() → [{key, center, element: 'rect'|'polygon'|'circle'|'ellipse', attrs: {...}}]
 *   - getDimensions() → {width, height}
 *   - getLines() → [{x1,y1,x2,y2} | {from,to}] (optional, for connections)
 *   - getAnnotations() → [{type, ...}] (optional, for star points / markers)
 *
 * Each cell provides its own SVG element type and attributes. The renderer
 * never interprets or modifies these — it emits them verbatim.
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
        const x1 = line.x1 !== undefined ? line.x1 : line.from.x
        const y1 = line.y1 !== undefined ? line.y1 : line.from.y
        const x2 = line.x2 !== undefined ? line.x2 : line.to.x
        const y2 = line.y2 !== undefined ? line.y2 : line.to.y
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
      }
      parts.push('</g>')
    }

    const cells = layout.getCells()
    parts.push(renderCells(cells, highlights))

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

  function renderCells(cells, highlights) {
    const parts = []
    const highlightSet = new Set(highlights.map(h => h.key))

    for (const cell of cells) {
      const attrs = { ...cell.attrs }
      if (highlightSet.has(cell.key)) {
        const h = highlights.find(h => h.key === cell.key)
        attrs.fill = h.color || '#ffff00'
      }
      parts.push(svgElement(cell.element, attrs))
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
      const r = (cell.attrs.width || cell.attrs.r || cell.attrs.rx || 20) * 0.35
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

function svgElement(element, attrs) {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')
  return `<${element} ${attrStr}/>`
}
