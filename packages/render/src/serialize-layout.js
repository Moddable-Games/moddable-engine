/**
 * Serialize structured layout output from a topology's renderLayout() to SVG string.
 *
 * Takes the {width, height, elements, cells, labels} shape and produces a complete
 * SVG document. Pieces are added on top if provided.
 */

const DISC_RATIO = { disc: 0.92, image: 0.60 }

export function serializeLayout(layout, opts = {}) {
  const { title, pieces, pieceImages, pieceSurface, pieceSurfaceMap, pieceRotations } = opts
  const { width, height, elements, cells, labels, defs } = layout

  const parts = []
  const overflow = opts.overflow ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"${overflow}>`)

  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (defs && defs.length > 0) {
    parts.push('<defs>')
    for (const d of defs) parts.push(elementToSvg(d))
    parts.push('</defs>')
  }

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
      if (!imgPath) continue
      const size = layout.tileSize || 40
      const rot = pieceRotations && piece.owner ? (pieceRotations[piece.owner] || 0) : 0
      const surface = pieceSurfaceMap?.[imgKey] ? pieceSurface : null
      if (surface && surface.type === 'disc') {
        const owner = piece.owner || (imgKey[0] === 'w' || imgKey[0] === imgKey[0].toUpperCase() ? 'white' : 'black')
        const ownerColors = surface.owners?.[owner] || { fill: '#ccc', stroke: '#888' }
        const discR = size * DISC_RATIO.disc / 2
        const imgSize = size * DISC_RATIO.image
        parts.push(`<circle cx="${cell.x}" cy="${cell.y}" r="${discR}" fill="${ownerColors.fill}" stroke="${ownerColors.stroke}" stroke-width="2"/>`)
        if (rot) {
          parts.push(`<g transform="rotate(${rot} ${cell.x} ${cell.y})"><image href="${imgPath}" x="${cell.x - imgSize / 2}" y="${cell.y - imgSize / 2}" width="${imgSize}" height="${imgSize}"/></g>`)
        } else {
          parts.push(`<image href="${imgPath}" x="${cell.x - imgSize / 2}" y="${cell.y - imgSize / 2}" width="${imgSize}" height="${imgSize}"/>`)
        }
      } else if (rot) {
        parts.push(`<g transform="rotate(${rot} ${cell.x} ${cell.y})"><image href="${imgPath}" x="${cell.x - size / 2}" y="${cell.y - size / 2}" width="${size}" height="${size}"/></g>`)
      } else {
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

/** Serialize a list of structured elements to an SVG fragment string (no joins). */
export function elementsToFragment(elements) {
  return elements.map(elementToSvg).join('')
}

export function elementToSvg(el) {
  if (!el || !el.tag) return ''
  const { tag, attrs = {}, text, children } = el
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(' ')
  const open = attrStr ? `<${tag} ${attrStr}` : `<${tag}`

  if (text != null) {
    return `${open}>${esc(String(text))}</${tag}>`
  }
  if (children && children.length > 0) {
    const inner = children.map(c => elementToSvg(c)).join('')
    return `${open}>${inner}</${tag}>`
  }
  return `${open}/>`
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
