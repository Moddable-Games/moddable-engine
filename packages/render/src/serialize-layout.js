/**
 * Serialize structured layout output from a topology's renderLayout() to SVG string.
 *
 * Takes the {width, height, elements, cells, labels} shape and produces a complete
 * SVG document. Pieces are added on top if provided.
 */

export function serializeLayout(layout, opts = {}) {
  const { title, pieces, pieceImages } = opts
  const { width, height, elements, cells, labels } = layout

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`)

  if (title) parts.push(`<title>${esc(title)}</title>`)

  for (const el of elements) {
    parts.push(elementToSvg(el))
  }

  for (const cell of cells) {
    parts.push(elementToSvg(cell.element))
  }

  if (pieces && Object.keys(pieces).length > 0) {
    parts.push('<g pointer-events="none">')
    for (const cell of cells) {
      const piece = pieces[cell.id]
      if (!piece) continue
      const imgKey = typeof piece === 'string' ? piece : piece.type
      const imgPath = pieceImages?.[imgKey]
      if (imgPath) {
        const size = layout.tileSize || 40
        parts.push(`<image href="${imgPath}" x="${cell.x - size / 2}" y="${cell.y - size / 2}" width="${size}" height="${size}"/>`)
      }
    }
    parts.push('</g>')
  }

  for (const lbl of labels) {
    parts.push(elementToSvg(lbl))
  }

  parts.push('</svg>')
  return parts.join('\n')
}

function elementToSvg(el) {
  if (!el || !el.tag) return ''
  const { tag, attrs = {}, text, children } = el
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(' ')

  if (text != null) {
    return `<${tag} ${attrStr}>${esc(String(text))}</${tag}>`
  }
  if (children && children.length > 0) {
    const inner = children.map(c => elementToSvg(c)).join('')
    return `<${tag} ${attrStr}>${inner}</${tag}>`
  }
  return `<${tag} ${attrStr}/>`
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
