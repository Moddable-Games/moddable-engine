/**
 * Hex SVG provider — produces SVG string fragments for hex-based boards.
 *
 * Moved verbatim from js/board-diagrams.js.
 */

// ─── HEX FRAME HELPERS ──────────────────────────────────────────────────────

const HEX_EDGE_NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]

function computeHexBorderEdges(hexes, size, flat, oX, oY, scale) {
  const set = new Set(hexes.map(h => `${h.q},${h.r}`))
  const edges = []
  for (const h of hexes) {
    const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
    const cx = oX + p.x, cy = oY + p.y
    const corners = hexCorners(cx, cy, size * scale, flat)
    for (let i = 0; i < 6; i++) {
      const [dq, dr] = HEX_EDGE_NEIGHBOURS[i]
      const nKey = `${h.q + dq},${h.r + dr}`
      if (!set.has(nKey)) {
        edges.push([corners[i], corners[(i + 1) % 6]])
      }
    }
  }
  return edges
}


// ─── HEX PROVIDER (ported from moddable-hexmaps/js/hex-math.js + hex-svg.js) ─

function axialToPixelPointy(q, r, size) {
  return { x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y: size * (3 / 2 * r) }
}

function axialToPixelFlat(q, r, size) {
  return { x: size * (3 / 2 * q), y: size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }
}

function hexCorners(cx, cy, size, flat) {
  const corners = []
  for (let i = 0; i < 6; i++) {
    const deg = flat ? 60 * i : 60 * i - 30
    const rad = Math.PI / 180 * deg
    corners.push({ x: cx + size * Math.cos(rad), y: cy + size * Math.sin(rad) })
  }
  return corners
}

function generateHexGrid(radius) {
  const hexes = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

function generateHexRhombus(rows, cols) {
  const hexes = []
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

export const hex = {
  name: 'hex',
  positionType: 'hex',
  labelStyle: 'none',
  defaultColors: {
    lightHex: '#f0d9b5', darkHex: '#b58863', midHex: '#d4a96a',
    stroke: 'rgba(0,0,0,0.2)', background: '#2c2c2c',
  },
  computeLayout(opts) {
    const hexes = this._getHexes(opts)
    const size = opts.hexSize || opts.tileSize || 30
    const flat = opts.flat || false
    const pad = opts.hexFrame ? size * 1.8 : size + 10
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const h of hexes) {
      const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    return { boardW: (maxX - minX) + pad * 2, boardH: (maxY - minY) + pad * 2, _originX: -minX + pad, _originY: -minY + pad }
  },
  _getHexes(opts) {
    if (opts.hexGrid) return opts.hexGrid
    if (opts.hexRadius != null) return generateHexGrid(opts.hexRadius)
    if (opts.hexRows && opts.hexCols) return generateHexRhombus(opts.hexRows, opts.hexCols)
    return generateHexGrid(opts.radius || 5)
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const hexes = this._getHexes(opts)
    const size = opts.hexSize || opts.tileSize || 30
    const flat = opts.flat || false
    const scale = opts.hexScale || 0.95
    const layout = this.computeLayout(opts)
    const oX = ox + layout._originX, oY = oy + layout._originY
    const parts = []
    const hexColorFn = opts.hexColorFn || null
    const hexTypes = opts.hexTypes || null

    const frame = opts.hexFrame || null
    if (!frame) {
      parts.push(`<rect x="${ox}" y="${oy}" width="${layout.boardW}" height="${layout.boardH}" fill="${colors.background}" rx="6"/>`)
    } else {
      const borderColor = colors.border || '#6b4226'
      parts.push(`<g fill="${borderColor}">`)
      for (const h of hexes) {
        const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
        const cx = oX + p.x, cy = oY + p.y
        const corners = hexCorners(cx, cy, size * 1.08, flat)
        parts.push(`<polygon points="${corners.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')}"/>`)
      }
      parts.push('</g>')
      const borderEdges = computeHexBorderEdges(hexes, size, flat, oX, oY, 1.05)
      parts.push(`<g fill="none" stroke="${borderColor}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">`)
      for (const [a, b] of borderEdges) {
        parts.push(`<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}"/>`)
      }
      parts.push('</g>')
    }

    for (const h of hexes) {
      const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
      const cx = oX + p.x, cy = oY + p.y
      const corners = hexCorners(cx, cy, size * scale, flat)
      const points = corners.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ')

      let fill
      if (hexColorFn) {
        fill = hexColorFn(h, colors)
      } else if (hexTypes && h.type && colors[h.type]) {
        fill = colors[h.type]
      } else {
        const s = h.q + h.r
        fill = s % 3 === 0 ? colors.lightHex : s % 3 === 1 ? colors.darkHex : colors.midHex
      }

      parts.push(`<polygon points="${points}" fill="${fill}" stroke="${colors.stroke}" stroke-width="1" data-sq="${h.q},${h.r}" class="board-cell"/>`)
    }

    if (opts.centreMarker) {
      const p = flat ? axialToPixelFlat(0, 0, size) : axialToPixelPointy(0, 0, size)
      const cx = oX + p.x, cy = oY + p.y
      parts.push(`<text x="${cx}" y="${cy + size * 0.3}" text-anchor="middle" font-size="${size * 0.8}" fill="rgba(255,200,50,0.85)" pointer-events="none">${opts.centreMarker}</text>`)
    }

    if (opts.hexPosition && opts.pieceImages) {
      parts.push(`<g pointer-events="none">`)
      for (const [key, piece] of Object.entries(opts.hexPosition)) {
        const [q, r] = key.split(',').map(Number)
        const p = flat ? axialToPixelFlat(q, r, size) : axialToPixelPointy(q, r, size)
        const cx = oX + p.x, cy = oY + p.y
        const pieceId = typeof piece === 'string' ? piece : piece.type
        const imgPath = opts.pieceImages[pieceId]
        if (imgPath) {
          const ps = size * 1.6
          parts.push(`<image href="${imgPath}" x="${(cx - ps/2).toFixed(1)}" y="${(cy - ps/2).toFixed(1)}" width="${ps.toFixed(1)}" height="${ps.toFixed(1)}"/>`)
        }
      }
      parts.push(`</g>`)
    }

    return parts.join('')
  },
  getIntersection(r, c, ctx) {
    const opts = ctx.opts
    const size = opts.hexSize || opts.tileSize || 30
    const flat = opts.flat || false
    const layout = this.computeLayout(opts)
    const oX = ctx.ox + layout._originX, oY = ctx.oy + layout._originY
    const p = flat ? axialToPixelFlat(c, r, size) : axialToPixelPointy(c, r, size)
    return { x: oX + p.x, y: oY + p.y }
  },
}

