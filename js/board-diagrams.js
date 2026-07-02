// Board diagram generator — direct port of moddable-chess/js/svg-renderer.js + providers.
// Produces identical output to the published rulebook SVGs.

// ─── PROVIDERS (ported verbatim from moddable-chess/js/svg-providers/) ──────

const checkered = {
  name: 'checkered',
  positionType: 'square',
  labelStyle: 'algebraic',
  defaultColors: { lightSquare: '#f0d9b5', darkSquare: '#b58863', voidFill: 'transparent' },
  computeLayout(opts) {
    const ts = opts.tileSize || 56
    return { boardW: opts.cols * ts, boardH: opts.rows * ts }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors, opts } = ctx
    const cellMap = opts.cellMap || null
    const parts = []
    if (cellMap) {
      parts.push(`<rect x="${ox}" y="${oy}" width="${cols * tileSize}" height="${rows * tileSize}" fill="${colors.voidFill}"/>`)
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = String.fromCharCode(97 + c) + (rows - r)
        if (cellMap) {
          const cell = cellMap[r] && cellMap[r][c]
          if (!cell) continue
          const fill = (typeof cell === 'string' && colors[cell]) ? colors[cell] : (r + c) % 2 === 0 ? colors.lightSquare : colors.darkSquare
          const stroke = (typeof cell === 'string' && colors[cell + 'Stroke']) ? colors[cell + 'Stroke'] : null
          let attrs = `x="${ox + c * tileSize}" y="${oy + r * tileSize}" width="${tileSize}" height="${tileSize}" fill="${fill}"`
          if (stroke) attrs += ` stroke="${stroke}" stroke-width="2"`
          else attrs += ` stroke="rgba(0,0,0,0.15)" stroke-width="1"`
          attrs += ` data-sq="${sq}" data-type="${cell}" class="board-cell"`
          parts.push(`<rect ${attrs}/>`)
        } else {
          const fill = (r + c) % 2 === 0 ? colors.lightSquare : colors.darkSquare
          parts.push(`<rect x="${ox + c * tileSize}" y="${oy + r * tileSize}" width="${tileSize}" height="${tileSize}" fill="${fill}" data-sq="${sq}" class="board-cell"/>`)
        }
      }
    }
    return parts.join('')
  },
}

const monoGrid = {
  name: 'mono-grid',
  positionType: 'square',
  labelStyle: 'algebraic',
  defaultColors: { monoSquare: '#d9b483', gridLine: '#8b6914' },
  computeLayout(opts) {
    const ts = opts.tileSize || 56
    return { boardW: opts.cols * ts, boardH: opts.rows * ts }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors } = ctx
    const bw = cols * tileSize, bh = rows * tileSize
    const parts = [`<rect x="${ox}" y="${oy}" width="${bw}" height="${bh}" fill="${colors.monoSquare}"/>`]
    for (let c = 0; c <= cols; c++) {
      const x = ox + c * tileSize
      parts.push(`<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy + bh}" stroke="${colors.gridLine}" stroke-width="1.5"/>`)
    }
    for (let r = 0; r <= rows; r++) {
      const y = oy + r * tileSize
      parts.push(`<line x1="${ox}" y1="${y}" x2="${ox + bw}" y2="${y}" stroke="${colors.gridLine}" stroke-width="1.5"/>`)
    }
    return parts.join('')
  },
}

const STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,9],[6,6],[9,3],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
}

const go = {
  name: 'go',
  positionType: 'intersection',
  labelStyle: 'go',
  defaultColors: {
    woodLight: '#dcb35c', woodDark: '#d4a843', gridLine: '#3d2b1a',
    labelText: '#5a4020', starPoint: '#3d2b1a',
    whitePieceFill: '#ffffff', whitePieceStroke: '#333333',
    blackPieceFill: '#1c1c1c', blackPieceStroke: '#888888',
  },
  computeLayout(opts) {
    const ts = opts.tileSize || 20
    return { boardW: (opts.cols - 1) * ts + 30, boardH: (opts.rows - 1) * ts + 30 }
  },
  getIntersection(r, c, ctx) {
    return { x: ctx.ox + 15 + c * ctx.tileSize, y: ctx.oy + 15 + r * ctx.tileSize }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors } = ctx
    const inset = 15, gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
    const boardW = gridW + inset * 2, boardH = gridH + inset * 2
    const gx = ox + inset, gy = oy + inset
    const parts = []
    parts.push(`<rect x="${ox}" y="${oy}" width="${boardW}" height="${boardH}" fill="${colors.woodLight}"/>`)
    parts.push(`<rect x="${gx}" y="${gy}" width="${gridW}" height="${gridH}" fill="${colors.woodDark}" rx="2"/>`)
    parts.push(`<g stroke="${colors.gridLine}" stroke-width="0.8">`)
    for (let r = 0; r < rows; r++) {
      const y = gy + r * tileSize
      parts.push(`<line x1="${gx}" y1="${y}" x2="${gx + gridW}" y2="${y}"/>`)
    }
    for (let c = 0; c < cols; c++) {
      const x = gx + c * tileSize
      parts.push(`<line x1="${x}" y1="${gy}" x2="${x}" y2="${gy + gridH}"/>`)
    }
    parts.push('</g>')
    const stars = STAR_POINTS[rows] || []
    if (stars.length > 0) {
      parts.push(`<g fill="${colors.starPoint}">`)
      for (const [r, c] of stars) {
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="3"/>`)
      }
      parts.push('</g>')
    }
    const GO_LETTERS = 'abcdefghjklmnopqrst'
    parts.push('<g fill="transparent">')
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = `${GO_LETTERS[c]}${rows - r}`
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="${tileSize * 0.45}" class="board-cell" data-sq="${sq}"/>`)
      }
    }
    parts.push('</g>')
    return parts.join('')
  },
}

const xiangqi = {
  name: 'xiangqi',
  positionType: 'intersection',
  labelStyle: 'none',
  defaultColors: {
    board: '#f5deb3', gridLine: '#4a3520', river: '#f5deb3',
    riverText: '#4a3520', palace: '#4a3520', labelText: '#4a3520',
  },
  computeLayout(opts) {
    const ts = opts.tileSize || 40, inset = 20
    return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
  },
  getIntersection(r, c, ctx) {
    return { x: ctx.ox + 20 + c * ctx.tileSize, y: ctx.oy + 20 + r * ctx.tileSize }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors, opts } = ctx
    const river = opts.river === true, inset = 20
    const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
    const gx = ox + inset, gy = oy + inset
    const parts = []
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="${colors.board}"/>`)
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="none" stroke="${colors.gridLine}" stroke-width="2"/>`)
    parts.push(`<g stroke="${colors.gridLine}" stroke-width="1">`)
    if (river) {
      for (let r = 0; r < rows; r++) {
        if (r === 4 || r === 5) continue
        const y = gy + r * tileSize
        parts.push(`<line x1="${gx}" y1="${y}" x2="${gx + gridW}" y2="${y}"/>`)
      }
      const ry1 = gy + 4 * tileSize, ry2 = gy + 5 * tileSize
      parts.push(`<line x1="${gx}" y1="${ry1}" x2="${gx + gridW}" y2="${ry1}"/>`)
      parts.push(`<line x1="${gx}" y1="${ry2}" x2="${gx + gridW}" y2="${ry2}"/>`)
      for (let c = 0; c < cols; c++) {
        const x = gx + c * tileSize
        if (c === 0 || c === cols - 1) {
          parts.push(`<line x1="${x}" y1="${gy}" x2="${x}" y2="${gy + gridH}"/>`)
        } else {
          parts.push(`<line x1="${x}" y1="${gy}" x2="${x}" y2="${ry1}"/>`)
          parts.push(`<line x1="${x}" y1="${ry2}" x2="${x}" y2="${gy + gridH}"/>`)
        }
      }
    } else {
      for (let r = 0; r < rows; r++) parts.push(`<line x1="${gx}" y1="${gy + r * tileSize}" x2="${gx + gridW}" y2="${gy + r * tileSize}"/>`)
      for (let c = 0; c < cols; c++) parts.push(`<line x1="${gx + c * tileSize}" y1="${gy}" x2="${gx + c * tileSize}" y2="${gy + gridH}"/>`)
    }
    parts.push('</g>')
    const pl = gx + 3 * tileSize, pr = gx + 5 * tileSize
    parts.push(`<g stroke="${colors.palace}" stroke-width="0.8" stroke-dasharray="4,3">`)
    parts.push(`<line x1="${pl}" y1="${gy}" x2="${pr}" y2="${gy + 2 * tileSize}"/>`)
    parts.push(`<line x1="${pr}" y1="${gy}" x2="${pl}" y2="${gy + 2 * tileSize}"/>`)
    parts.push(`<line x1="${pl}" y1="${gy + 7 * tileSize}" x2="${pr}" y2="${gy + 9 * tileSize}"/>`)
    parts.push(`<line x1="${pr}" y1="${gy + 7 * tileSize}" x2="${pl}" y2="${gy + 9 * tileSize}"/>`)
    parts.push('</g>')
    if (river) {
      const ry1 = gy + 4 * tileSize, ry2 = gy + 5 * tileSize
      const mid = (ry1 + ry2) / 2
      parts.push(`<text x="${gx + gridW * 0.25}" y="${mid + 5}" text-anchor="middle" font-size="14" font-family="serif" pointer-events="none" fill="${colors.riverText}">楚 河</text>`)
      parts.push(`<text x="${gx + gridW * 0.75}" y="${mid + 5}" text-anchor="middle" font-size="14" font-family="serif" pointer-events="none" fill="${colors.riverText}">漢 界</text>`)
    }
    parts.push('<g fill="transparent">')
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = `${String.fromCharCode(97 + c)}${rows - r}`
        const ix = gx + c * tileSize, iy = gy + r * tileSize
        parts.push(`<circle cx="${ix}" cy="${iy}" r="${tileSize * 0.4}" class="board-cell" data-sq="${sq}"/>`)
      }
    }
    parts.push('</g>')
    return parts.join('')
  },
}

const HOSHI_9 = [[2,2],[2,6],[6,2],[6,6]]

const shogi = {
  name: 'shogi',
  positionType: 'intersection',
  labelStyle: 'none',
  defaultColors: {
    board: '#e8c97a', boardBorder: '#8b6914', gridLine: '#6b4e1a',
    hoshi: '#6b4e1a', promotionZone: 'rgba(180, 60, 40, 0.08)', labelText: '#5a4020',
  },
  computeLayout(opts) {
    const ts = opts.tileSize || 40, inset = 20
    return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
  },
  getIntersection(r, c, ctx) {
    return { x: ctx.ox + 20 + c * ctx.tileSize, y: ctx.oy + 20 + r * ctx.tileSize }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors } = ctx
    const inset = 20, gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
    const gx = ox + inset, gy = oy + inset
    const parts = []
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="${colors.board}"/>`)
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="none" stroke="${colors.boardBorder}" stroke-width="2"/>`)
    if (rows === 9) {
      parts.push(`<rect x="${gx}" y="${gy}" width="${gridW}" height="${2 * tileSize}" fill="${colors.promotionZone}"/>`)
      parts.push(`<rect x="${gx}" y="${gy + 6 * tileSize}" width="${gridW}" height="${2 * tileSize}" fill="${colors.promotionZone}"/>`)
    }
    parts.push(`<g stroke="${colors.gridLine}" stroke-width="0.8">`)
    for (let r = 0; r < rows; r++) parts.push(`<line x1="${gx}" y1="${gy + r * tileSize}" x2="${gx + gridW}" y2="${gy + r * tileSize}"/>`)
    for (let c = 0; c < cols; c++) parts.push(`<line x1="${gx + c * tileSize}" y1="${gy}" x2="${gx + c * tileSize}" y2="${gy + gridH}"/>`)
    parts.push('</g>')
    if (rows === 9 && cols === 9) {
      parts.push(`<g fill="${colors.hoshi}">`)
      for (const [r, c] of HOSHI_9) parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="3"/>`)
      parts.push('</g>')
    }
    parts.push('<g fill="transparent">')
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = `${String.fromCharCode(97 + c)}${rows - r}`
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="${tileSize * 0.4}" class="board-cell" data-sq="${sq}"/>`)
      }
    }
    parts.push('</g>')
    return parts.join('')
  },
}

const morris = {
  name: 'morris',
  positionType: 'node',
  labelStyle: 'none',
  defaultColors: { background: '#f5e6c8', line: '#4a3520', point: '#4a3520' },
  computeLayout(opts) {
    const size = opts.boardSize || 320
    return { boardW: size, boardH: size }
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const size = opts.boardSize || 320
    const rings = opts.rings || 3
    const diagonals = opts.diagonals || false
    const midpoints = opts.midpoints !== false
    const pointRadius = opts.pointRadius || 7
    const parts = []
    parts.push(`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="${colors.background}" rx="4"/>`)
    const cx = ox + size / 2, cy = oy + size / 2
    const ringRects = computeRings(rings, size, ox, oy)
    parts.push(`<g fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linecap="square">`)
    for (const rect of ringRects) parts.push(`<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}"/>`)
    if (midpoints) {
      if (rings === 1) {
        const r = ringRects[0]
        parts.push(`<line x1="${cx}" y1="${r.y}" x2="${cx}" y2="${r.y + r.h}"/>`)
        parts.push(`<line x1="${r.x}" y1="${cy}" x2="${r.x + r.w}" y2="${cy}"/>`)
      } else {
        parts.push(`<line x1="${cx}" y1="${ringRects[0].y}" x2="${cx}" y2="${ringRects[rings - 1].y}"/>`)
        const last = ringRects[rings - 1]
        parts.push(`<line x1="${cx}" y1="${last.y + last.h}" x2="${cx}" y2="${ringRects[0].y + ringRects[0].h}"/>`)
        parts.push(`<line x1="${ringRects[0].x}" y1="${cy}" x2="${ringRects[rings - 1].x}" y2="${cy}"/>`)
        parts.push(`<line x1="${last.x + last.w}" y1="${cy}" x2="${ringRects[0].x + ringRects[0].w}" y2="${cy}"/>`)
      }
    }
    if (diagonals) {
      if (rings === 1) {
        const r = ringRects[0]
        parts.push(`<line x1="${r.x}" y1="${r.y}" x2="${r.x + r.w}" y2="${r.y + r.h}"/>`)
        parts.push(`<line x1="${r.x + r.w}" y1="${r.y}" x2="${r.x}" y2="${r.y + r.h}"/>`)
      } else {
        const o = ringRects[0], i = ringRects[rings - 1]
        parts.push(`<line x1="${o.x}" y1="${o.y}" x2="${i.x}" y2="${i.y}"/>`)
        parts.push(`<line x1="${o.x + o.w}" y1="${o.y}" x2="${i.x + i.w}" y2="${i.y}"/>`)
        parts.push(`<line x1="${o.x}" y1="${o.y + o.h}" x2="${i.x}" y2="${i.y + i.h}"/>`)
        parts.push(`<line x1="${o.x + o.w}" y1="${o.y + o.h}" x2="${i.x + i.w}" y2="${i.y + i.h}"/>`)
      }
    }
    parts.push('</g>')
    const points = computePoints(ringRects, midpoints, cx, cy, rings)
    parts.push(`<g fill="${colors.point}">`)
    for (const p of points) parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointRadius}"/>`)
    parts.push('</g>')
    return parts.join('')
  },
}

function computeRings(rings, size, ox, oy) {
  const rects = []
  const margin = size * 0.0625, maxInset = size * 0.375
  const step = rings > 1 ? (maxInset - margin) / (rings - 1) : 0
  for (let i = 0; i < rings; i++) {
    const inset = margin + i * step
    rects.push({ x: ox + inset, y: oy + inset, w: size - inset * 2, h: size - inset * 2 })
  }
  return rects
}

function computePoints(ringRects, midpoints, cx, cy, rings) {
  const points = []
  for (const rect of ringRects) {
    points.push({ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y })
    points.push({ x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h })
    if (midpoints) {
      points.push({ x: cx, y: rect.y }, { x: rect.x + rect.w, y: cy })
      points.push({ x: cx, y: rect.y + rect.h }, { x: rect.x, y: cy })
    }
  }
  if (rings === 1 && midpoints) points.push({ x: cx, y: cy })
  return points
}

const alquerque = {
  name: 'alquerque',
  positionType: 'intersection',
  labelStyle: 'algebraic',
  defaultColors: { monoSquare: '#d9b483', gridLine: '#8b6914' },
  computeLayout(opts) {
    const ts = opts.tileSize || 56
    const inset = Math.round(ts * 0.5)
    return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
  },
  getIntersection(r, c, ctx) {
    const inset = Math.round(ctx.tileSize * 0.5)
    return { x: ctx.ox + inset + c * ctx.tileSize, y: ctx.oy + inset + r * ctx.tileSize }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors } = ctx
    const inset = Math.round(tileSize * 0.5)
    const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
    const gx = ox + inset, gy = oy + inset
    const parts = []
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="${colors.monoSquare}" rx="4"/>`)
    for (let r = 0; r < rows; r++) parts.push(`<line x1="${gx}" y1="${gy + r * tileSize}" x2="${gx + gridW}" y2="${gy + r * tileSize}" stroke="${colors.gridLine}" stroke-width="2"/>`)
    for (let c = 0; c < cols; c++) parts.push(`<line x1="${gx + c * tileSize}" y1="${gy}" x2="${gx + c * tileSize}" y2="${gy + gridH}" stroke="${colors.gridLine}" stroke-width="2"/>`)
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if ((r + c) % 2 !== 0) continue
        const x1 = gx + c * tileSize, y1 = gy + r * tileSize
        const x2 = gx + (c + 1) * tileSize, y2 = gy + (r + 1) * tileSize
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.gridLine}" stroke-width="1.5"/>`)
        parts.push(`<line x1="${x2}" y1="${y1}" x2="${x1}" y2="${y2}" stroke="${colors.gridLine}" stroke-width="1.5"/>`)
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="3" fill="${colors.gridLine}"/>`)
      }
    }
    return parts.join('')
  },
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

const hex = {
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
    const scale = (opts.hexScale || 0.95)
    const pad = size + 10
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

    parts.push(`<rect x="${ox}" y="${oy}" width="${layout.boardW}" height="${layout.boardH}" fill="${colors.background}" rx="6"/>`)

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

// ─── MANCALA PROVIDER ───────────────────────────────────────────────────────

const mancala = {
  name: 'mancala',
  positionType: 'pit',
  labelStyle: 'none',
  defaultColors: {
    boardOuter: '#7A5A32', boardInner: '#9B7740',
    pit: '#4E3320', pitStroke: '#3A2515',
    seed: '#C8B898', seedStroke: '#8A7A5A',
    marker: '#C49040', border: null, borderDash: null,
  },
  computeLayout(opts) {
    const pitsPerSide = opts.pitsPerSide || 6
    const hasStores = opts.hasStores !== false
    const boardRows = opts.boardRows || 2
    const pitRadius = opts.pitRadius || 22
    const storeRx = opts.storeRx || 24
    const storeRy = opts.storeRy || 50
    const boardShape = opts.boardShape || 'rect'
    const rx = opts.cornerRadius || 22
    const padEdge = opts.padEdge || pitRadius * 1.5

    const storeWidth = hasStores ? storeRx * 2 + 16 : 0
    const pitsAreaWidth = pitsPerSide * (pitRadius * 2 + 10)
    const boardW = storeWidth * 2 + pitsAreaWidth + padEdge * 2
    const rowHeight = pitRadius * 2 + 16
    const boardH = boardRows * rowHeight + 40

    return { boardW, boardH, pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, storeWidth, rx, padEdge }
  },
  render(ctx) {
    const { colors, opts } = ctx
    const layout = this.computeLayout(opts)
    const { pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, boardW, boardH, storeWidth, rx, padEdge } = layout
    const parts = []

    const bx = 10, by = 15
    const bw = boardW - 20, bh = boardH - 30

    if (boardShape === 'ellipse') {
      parts.push(`<ellipse cx="${boardW / 2}" cy="${boardH / 2}" rx="${bw / 2}" ry="${bh / 2}" fill="${colors.boardOuter}"/>`)
      parts.push(`<ellipse cx="${boardW / 2}" cy="${boardH / 2}" rx="${bw / 2 - 8}" ry="${bh / 2 - 8}" fill="${colors.boardInner}"/>`)
    } else {
      parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${rx}" ry="${rx}" fill="${colors.boardOuter}"/>`)
      parts.push(`<rect x="${bx + 6}" y="${by + 6}" width="${bw - 12}" height="${bh - 12}" rx="${rx - 4}" ry="${rx - 4}" fill="${colors.boardInner}"/>`)
      if (colors.border) {
        const dashAttr = colors.borderDash ? ` stroke-dasharray="${colors.borderDash}"` : ''
        parts.push(`<rect x="${bx + 12}" y="${by + 12}" width="${bw - 24}" height="${bh - 24}" rx="${rx - 8}" ry="${rx - 8}" fill="none" stroke="${colors.border}" stroke-width="1.5"${dashAttr}/>`)
      }
    }

    if (hasStores) {
      const storeCy = boardH / 2
      const leftX = bx + storeWidth / 2 + 4
      const rightX = boardW - bx - storeWidth / 2 - 4
      parts.push(`<ellipse cx="${leftX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-1"/>`)
      parts.push(`<ellipse cx="${rightX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-0"/>`)
    }

    const pitsLeftEdge = bx + (hasStores ? storeWidth : 0) + padEdge
    const pitsRightEdge = boardW - bx - (hasStores ? storeWidth : 0) - padEdge
    const pitsAvailWidth = pitsRightEdge - pitsLeftEdge
    const pitSpacing = pitsPerSide > 1 ? pitsAvailWidth / (pitsPerSide - 1) : 0

    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const markers = opts.markers || []
    const markerSet = new Set(markers)
    const pitCurve = opts.pitCurve || 0

    const rowCenters = []
    if (boardRows === 2) {
      rowCenters.push(boardH * 0.33, boardH * 0.67)
    } else if (boardRows === 4) {
      const innerTop = by + 20
      const innerBot = boardH - by - 20
      const rowH = (innerBot - innerTop) / 4
      for (let r = 0; r < 4; r++) rowCenters.push(innerTop + rowH * r + rowH / 2)
    }

    for (let row = 0; row < boardRows; row++) {
      const isTopHalf = row < boardRows / 2
      const baseCy = rowCenters[row]

      for (let i = 0; i < pitsPerSide; i++) {
        const displayIdx = isTopHalf ? (pitsPerSide - 1 - i) : i
        const pitIdx = row * pitsPerSide + displayIdx
        const cx = pitsLeftEdge + i * pitSpacing

        let cy = baseCy
        if (pitCurve) {
          const t = (i - (pitsPerSide - 1) / 2) / ((pitsPerSide - 1) / 2)
          const curveOffset = pitCurve * t * t
          cy += isTopHalf ? -curveOffset : curveOffset
        }

        parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${pitIdx}"/>`)

        if (markerSet.has(pitIdx)) {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
        }

        const seedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[pitIdx] : seedsPerPit
        if (seedCount > 0) {
          parts.push(renderSeeds(cx, cy, seedCount, seedRadius, colors))
        }
      }
    }

    if (boardRows === 4) {
      const divY = boardH / 2
      parts.push(`<line x1="${pitsLeftEdge - pitRadius}" y1="${divY}" x2="${pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius}" y2="${divY}" stroke="${colors.boardOuter}" stroke-width="2.5" stroke-dasharray="6,4"/>`)
    }

    return parts.join('')
  },
}

function renderSeeds(cx, cy, count, r, colors) {
  const parts = []
  const positions = seedLayout(count, r)
  for (const [sx, sy] of positions) {
    parts.push(`<circle cx="${cx + sx}" cy="${cy + sy}" r="${r}" fill="${colors.seed}" stroke="${colors.seedStroke}" stroke-width="0.5"/>`)
  }
  return parts.join('')
}

function seedLayout(count, r) {
  if (count <= 0) return []
  const gap = r * 2.5
  if (count === 1) return [[0, 0]]
  if (count === 2) return [[-gap / 2, 0], [gap / 2, 0]]
  if (count === 3) return [[0, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
  if (count === 4) return [[-gap / 2, -gap / 2], [gap / 2, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
  if (count <= 6) {
    const top = Math.ceil(count / 2)
    const bot = count - top
    const result = []
    for (let i = 0; i < top; i++) result.push([(i - (top - 1) / 2) * gap, -gap / 2])
    for (let i = 0; i < bot; i++) result.push([(i - (bot - 1) / 2) * gap, gap / 2])
    return result
  }
  if (count <= 9) {
    const rows = [Math.ceil(count / 3), Math.ceil((count - Math.ceil(count / 3)) / 2), count - Math.ceil(count / 3) - Math.ceil((count - Math.ceil(count / 3)) / 2)]
    const result = []
    for (let ri = 0; ri < 3; ri++) {
      const n = rows[ri]
      for (let i = 0; i < n; i++) result.push([(i - (n - 1) / 2) * gap, (ri - 1) * gap])
    }
    return result
  }
  const result = []
  const side = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / side)
    const col = i % side
    const rowCount = (row < Math.floor(count / side)) ? side : count % side || side
    result.push([(col - (rowCount - 1) / 2) * gap * 0.8, (row - (Math.ceil(count / side) - 1) / 2) * gap * 0.8])
  }
  return result
}

// ─── PROVIDER REGISTRY ──────────────────────────────────────────────────────

const PROVIDERS = { checkered, 'mono-grid': monoGrid, go, xiangqi, shogi, morris, alquerque, hex, mancala }

// ─── RENDERER (ported from moddable-chess/js/svg-renderer.js) ───────────────

function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function algToRC(alg, rows, skipI) {
  const file = alg.charCodeAt(0) - 97
  const col = (skipI && file > 8) ? file - 1 : file
  return [rows - parseInt(alg.slice(1), 10), col]
}

export function renderBoard(opts) {
  opts = opts || {}
  const boardStyle = opts.boardStyle || 'checkered'
  const provider = PROVIDERS[boardStyle]
  if (!provider) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Unknown: "${boardStyle}"</text></svg>`

  const rows = opts.rows || 8
  const cols = opts.cols || 8
  const tileSize = opts.tileSize || 56
  const position = opts.position || {}
  const showLabels = opts.showLabels !== false
  const title = opts.title || null

  const providerColors = provider.defaultColors || {}
  const colors = { ...providerColors, ...(opts.colors || {}) }

  const layout = provider.computeLayout({ rows, cols, tileSize, ...opts })
  const boardW = layout.boardW, boardH = layout.boardH
  const labelStyle = provider.labelStyle || 'algebraic'
  const pad = (showLabels && labelStyle !== 'none') ? 24 : 0
  const W = boardW + pad * 2, H = boardH + pad * 2
  const ox = pad, oy = pad

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`)
  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (position && Object.keys(position).length > 0) {
    parts.push(collectDefs(position, opts.pieceDefs))
  }

  const ctx = { rows, cols, tileSize, ox, oy, colors, opts, boardW, boardH }
  parts.push(provider.render(ctx))

  if (position && Object.keys(position).length > 0) {
    parts.push(`<g pointer-events="none">${renderPieces(position, provider, ctx, colors)}</g>`)
  }

  if (showLabels && labelStyle !== 'none') {
    parts.push(renderLabels(ctx, colors, provider))
  }

  parts.push('</svg>')
  return parts.join('\n')
}

// ─── FEN PARSER (from moddable-chess generate-svgs.mjs) ─────────────────────

export function fenToPosition(fen, rows, cols) {
  const positionPart = fen.split(' ')[0]
  const ranks = positionPart.split('/')
  const position = {}
  for (let r = 0; r < ranks.length; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length) {
      const ch = rank[i]
      if (ch >= '1' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next); i += 2 }
        else { c += parseInt(ch); i++ }
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        position[`${file}${rankNum}`] = ch
        c++; i++
      }
    }
  }
  return position
}

// ─── PIECE RENDERING ────────────────────────────────────────────────────────

function getPixelPos(r, c, provider, ctx) {
  if (provider.getIntersection) return provider.getIntersection(r, c, ctx)
  const { tileSize, ox, oy } = ctx
  return { x: ox + c * tileSize + tileSize / 2, y: oy + r * tileSize + tileSize / 2 }
}

function renderPieces(position, provider, ctx, colors) {
  const { rows, cols, tileSize, opts } = ctx
  const pieceImages = opts.pieceImages || {}
  const skipI = provider.labelStyle === 'go'
  const parts = []
  for (const [alg, raw] of Object.entries(position)) {
    const [r, c] = algToRC(alg, rows, skipI)
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue
    const piece = typeof raw === 'object' ? raw : { type: String(raw) }
    const pos = getPixelPos(r, c, provider, ctx)

    // Build lookup key: for typed pieces (stone/man/king) use color prefix
    const colorPrefix = piece.color === 'white' ? 'w' : 'b'
    const imageKey = (piece.type === 'stone') ? colorPrefix + 'S'
      : (piece.type === 'man') ? colorPrefix + 'M'
      : (piece.type === 'king') ? colorPrefix + 'K'
      : piece.type

    if (pieceImages[imageKey]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
    } else if (piece.type === 'stone') {
      parts.push(drawStone(piece, pos.x, pos.y, tileSize * 0.42, colors))
    } else if (piece.type === 'man' || piece.type === 'king') {
      parts.push(drawDraughtsPiece(piece, pos.x, pos.y, tileSize * 0.38, colors))
    } else if (pieceImages[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<image href="${pieceImages[piece.type]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
    } else if (opts.pieceDefs && opts.pieceDefs[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<use href="#piece-${piece.type}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}"/>`)
    }
  }
  return parts.join('')
}

function collectDefs(position, pieceDefs) {
  if (!pieceDefs) return ''
  const needed = new Set()
  for (const raw of Object.values(position)) {
    const t = typeof raw === 'object' ? raw.type : String(raw)
    if (pieceDefs[t]) needed.add(t)
  }
  if (needed.size === 0) return ''
  const parts = ['<defs>']
  for (const t of needed) {
    parts.push(`<symbol id="piece-${t}" viewBox="0 0 45 45">${pieceDefs[t]}</symbol>`)
  }
  parts.push('</defs>')
  return parts.join('')
}

function drawStone(piece, cx, cy, r, C) {
  const isW = piece.color === 'white'
  const fill = isW ? (C.whitePieceFill || '#fff') : (C.blackPieceFill || '#1c1c1c')
  const stroke = isW ? (C.whitePieceStroke || '#333') : (C.blackPieceStroke || '#888')
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
}

function drawDraughtsPiece(piece, cx, cy, r, C) {
  const isW = piece.color === 'white'
  const fill = isW ? '#fff' : '#333'
  const stroke = isW ? '#333' : '#111'
  const inner = isW ? '#ccc' : '#555'
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
  svg += `<circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="none" stroke="${inner}" stroke-width="1"/>`
  if (piece.type === 'king') svg += `<circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="none" stroke="${inner}" stroke-width="1.5"/>`
  return svg
}

// ─── LABELS ─────────────────────────────────────────────────────────────────

function renderLabels(ctx, colors, provider) {
  const { rows, cols, tileSize, ox, oy, boardH } = ctx
  const labelStyle = provider.labelStyle || 'algebraic'
  const pad = 24, fs = Math.min(13, pad * 0.55)
  const parts = []
  const bottomY = oy + boardH + pad * 0.65

  if (labelStyle === 'go') {
    const GO = 'ABCDEFGHJKLMNOPQRST'
    for (let c = 0; c < cols; c++) {
      const pos = getPixelPos(0, c, provider, ctx)
      parts.push(`<text x="${pos.x}" y="${bottomY}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5a4020')}" font-family="sans-serif">${GO[c]}</text>`)
    }
    for (let r = 0; r < rows; r++) {
      const pos = getPixelPos(r, 0, provider, ctx)
      parts.push(`<text x="${pad * 0.5}" y="${pos.y + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5a4020')}" font-family="sans-serif">${rows - r}</text>`)
    }
  } else {
    for (let c = 0; c < cols; c++) {
      const pos = getPixelPos(0, c, provider, ctx)
      parts.push(`<text x="${pos.x}" y="${bottomY}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5c3a1e')}" font-family="monospace">${String.fromCharCode(97 + c)}</text>`)
    }
    for (let r = 0; r < rows; r++) {
      const pos = getPixelPos(r, 0, provider, ctx)
      parts.push(`<text x="${pad * 0.5}" y="${pos.y + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5c3a1e')}" font-family="monospace">${rows - r}</text>`)
    }
  }
  return parts.join('')
}
