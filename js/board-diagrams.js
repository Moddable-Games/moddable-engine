// Board diagram generator — direct port of moddable-chess/js/svg-renderer.js + providers.
// Produces identical output to the published rulebook SVGs.

import { renderSurfaceSVG } from './piece-surface.js'

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
          if (cell === 'rosette') {
            const rcx = ox + c * tileSize + tileSize / 2
            const rcy = oy + r * tileSize + tileSize / 2
            const s = tileSize * 0.25
            parts.push(`<circle cx="${rcx}" cy="${rcy}" r="${s * 0.42}" fill="#8b3a3a"/>`)
            parts.push(`<circle cx="${rcx}" cy="${rcy - s}" r="${s * 0.25}" fill="#8b3a3a"/>`)
            parts.push(`<circle cx="${rcx}" cy="${rcy + s}" r="${s * 0.25}" fill="#8b3a3a"/>`)
            parts.push(`<circle cx="${rcx - s}" cy="${rcy}" r="${s * 0.25}" fill="#8b3a3a"/>`)
            parts.push(`<circle cx="${rcx + s}" cy="${rcy}" r="${s * 0.25}" fill="#8b3a3a"/>`)
            parts.push(`<circle cx="${rcx - s * 0.7}" cy="${rcy - s * 0.7}" r="${s * 0.17}" fill="#a04848"/>`)
            parts.push(`<circle cx="${rcx + s * 0.7}" cy="${rcy - s * 0.7}" r="${s * 0.17}" fill="#a04848"/>`)
            parts.push(`<circle cx="${rcx - s * 0.7}" cy="${rcy + s * 0.7}" r="${s * 0.17}" fill="#a04848"/>`)
            parts.push(`<circle cx="${rcx + s * 0.7}" cy="${rcy + s * 0.7}" r="${s * 0.17}" fill="#a04848"/>`)
          }
          if (cell === 'castle') {
            const ccx = ox + c * tileSize + tileSize / 2
            const ccy = oy + r * tileSize + tileSize / 2
            const d = tileSize * 0.3
            const xStroke = colors.castleX || '#fff8f0'
            parts.push(`<line x1="${ccx - d}" y1="${ccy - d}" x2="${ccx + d}" y2="${ccy + d}" stroke="${xStroke}" stroke-width="1.5" stroke-linecap="round"/>`)
            parts.push(`<line x1="${ccx + d}" y1="${ccy - d}" x2="${ccx - d}" y2="${ccy + d}" stroke="${xStroke}" stroke-width="1.5" stroke-linecap="round"/>`)
          }
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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = String.fromCharCode(97 + c) + (rows - r)
        parts.push(`<rect x="${ox + c * tileSize}" y="${oy + r * tileSize}" width="${tileSize}" height="${tileSize}" fill="transparent" data-sq="${sq}" class="board-cell"/>`)
      }
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

const surakarta = {
  name: 'surakarta',
  positionType: 'intersection',
  labelStyle: 'algebraic',
  defaultColors: {
    frame: '#5a3e28', board: '#c8a872', boardInner: '#d4b896',
    gridLine: '#6b4a30', dotFill: '#4a3320',
    innerArc: '#6b4a30', outerArc: '#6b4a30',
  },
  computeLayout(opts) {
    const ts = opts.tileSize || 50
    const arcPad = ts * 2.3
    return { boardW: (opts.cols - 1) * ts + arcPad * 2, boardH: (opts.rows - 1) * ts + arcPad * 2 }
  },
  getIntersection(r, c, ctx) {
    const arcPad = ctx.tileSize * 2.3
    return { x: ctx.ox + arcPad + c * ctx.tileSize, y: ctx.oy + arcPad + r * ctx.tileSize }
  },
  render(ctx) {
    const { rows, cols, tileSize, ox, oy, colors } = ctx
    const arcPad = tileSize * 2.3
    const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
    const boardW = gridW + arcPad * 2, boardH = gridH + arcPad * 2
    const gx = ox + arcPad, gy = oy + arcPad
    const parts = []

    parts.push(`<rect x="${ox}" y="${oy}" width="${boardW}" height="${boardH}" rx="8" fill="${colors.frame}"/>`)
    parts.push(`<rect x="${ox + 6}" y="${oy + 6}" width="${boardW - 12}" height="${boardH - 12}" rx="5" fill="${colors.board}"/>`)
    parts.push(`<rect x="${ox + 10}" y="${oy + 10}" width="${boardW - 20}" height="${boardH - 20}" rx="3" fill="${colors.boardInner}"/>`)

    parts.push(`<g stroke="${colors.gridLine}" stroke-width="1.5">`)
    for (let r = 0; r < rows; r++) {
      const y = gy + r * tileSize
      parts.push(`<line x1="${gx}" y1="${y}" x2="${gx + gridW}" y2="${y}"/>`)
    }
    for (let c = 0; c < cols; c++) {
      const x = gx + c * tileSize
      parts.push(`<line x1="${x}" y1="${gy}" x2="${x}" y2="${gy + gridH}"/>`)
    }
    parts.push('</g>')

    const innerR = tileSize
    const outerR = tileSize * 2
    parts.push(`<g fill="none" stroke-width="2.5" stroke-linecap="round">`)
    const ix = (i) => gx + i * tileSize
    const iy = (i) => gy + i * tileSize
    parts.push(`<path d="M ${ix(1)},${iy(0)} A ${innerR},${innerR} 0 1,0 ${ix(0)},${iy(1)}" stroke="${colors.innerArc}"/>`)
    parts.push(`<path d="M ${ix(cols - 2)},${iy(0)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 1)},${iy(1)}" stroke="${colors.innerArc}"/>`)
    parts.push(`<path d="M ${ix(0)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,0 ${ix(1)},${iy(rows - 1)}" stroke="${colors.innerArc}"/>`)
    parts.push(`<path d="M ${ix(cols - 1)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 2)},${iy(rows - 1)}" stroke="${colors.innerArc}"/>`)
    parts.push(`<path d="M ${ix(2)},${iy(0)} A ${outerR},${outerR} 0 1,0 ${ix(0)},${iy(2)}" stroke="${colors.outerArc}"/>`)
    parts.push(`<path d="M ${ix(cols - 3)},${iy(0)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 1)},${iy(2)}" stroke="${colors.outerArc}"/>`)
    parts.push(`<path d="M ${ix(0)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,0 ${ix(2)},${iy(rows - 1)}" stroke="${colors.outerArc}"/>`)
    parts.push(`<path d="M ${ix(cols - 1)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 3)},${iy(rows - 1)}" stroke="${colors.outerArc}"/>`)
    parts.push('</g>')

    parts.push(`<g fill="${colors.dotFill}">`)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="3.5"/>`)
      }
    }
    parts.push('</g>')

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

// ─── NYOUT (YUT NORI) PROVIDER ─────────────────────────────────────────────

const nyout = {
  name: 'nyout',
  positionType: 'node',
  labelStyle: 'none',
  defaultColors: { background: '#f5e6c8', line: '#4a3520', point: '#4a3520', junction: '#c0622f', centre: '#8b1a1a' },
  computeLayout(opts) {
    const size = opts.boardSize || 320
    return { boardW: size, boardH: size }
  },
  getNodes(size, ox, oy) {
    // 29 stations: 20 outer (square perimeter) + 1 centre + 8 diagonal intermediates
    const margin = size * 0.08
    const inner = size - margin * 2
    const nodes = []
    const edges = []

    const x0 = ox + margin, x1 = ox + size - margin
    const y0 = oy + margin, y1 = oy + size - margin
    const cx = ox + size / 2, cy = oy + size / 2

    const corners = [
      { x: x1, y: y1 },  // SE (chammeoki - start)
      { x: x0, y: y1 },  // SW (chi-mo)
      { x: x0, y: y0 },  // NW (duet-mo/busan)
      { x: x1, y: y0 },  // NE (mo)
    ]

    // Outer ring: 4 sides × 5 nodes (corner + 4 intermediates) = 20 total
    const outerNodes = []
    for (let side = 0; side < 4; side++) {
      const from = corners[side]
      const to = corners[(side + 1) % 4]
      outerNodes.push(from)
      for (let i = 1; i <= 4; i++) {
        outerNodes.push({
          x: from.x + (to.x - from.x) * i / 5,
          y: from.y + (to.y - from.y) * i / 5,
        })
      }
    }
    for (let i = 0; i < 20; i++) edges.push([i, (i + 1) % 20])
    for (const n of outerNodes) nodes.push(n)

    // Centre node (index 20)
    nodes.push({ x: cx, y: cy })

    // Diagonal shortcuts: NW↔SE and NE↔SW through centre
    // NW corner = index 10, SE corner = index 0
    // NE corner = index 15, SW corner = index 5
    // Each diagonal has 2 intermediate nodes between corner and centre

    // NW→SE diagonal intermediates (indices 21, 22 between NW and centre; 23, 24 between centre and SE)
    const nw = corners[2], se = corners[0]
    nodes.push({ x: nw.x + (cx - nw.x) * 1 / 3, y: nw.y + (cy - nw.y) * 1 / 3 }) // 21
    nodes.push({ x: nw.x + (cx - nw.x) * 2 / 3, y: nw.y + (cy - nw.y) * 2 / 3 }) // 22
    nodes.push({ x: cx + (se.x - cx) * 1 / 3, y: cy + (se.y - cy) * 1 / 3 })       // 23
    nodes.push({ x: cx + (se.x - cx) * 2 / 3, y: cy + (se.y - cy) * 2 / 3 })       // 24

    // NE→SW diagonal intermediates (indices 25, 26 between NE and centre; 27, 28 between centre and SW)
    const ne = corners[3], sw = corners[1]
    nodes.push({ x: ne.x + (cx - ne.x) * 1 / 3, y: ne.y + (cy - ne.y) * 1 / 3 }) // 25
    nodes.push({ x: ne.x + (cx - ne.x) * 2 / 3, y: ne.y + (cy - ne.y) * 2 / 3 }) // 26
    nodes.push({ x: cx + (sw.x - cx) * 1 / 3, y: cy + (sw.y - cy) * 1 / 3 })       // 27
    nodes.push({ x: cx + (sw.x - cx) * 2 / 3, y: cy + (sw.y - cy) * 2 / 3 })       // 28

    // Diagonal edges: NW(10)→21→22→centre(20)→23→24→SE(0)
    edges.push([10, 21], [21, 22], [22, 20], [20, 23], [23, 24], [24, 0])
    // NE(15)→25→26→centre(20)→27→28→SW(5)
    edges.push([15, 25], [25, 26], [26, 20], [20, 27], [27, 28], [28, 5])

    // Junction nodes: corners 0 (SE), 5 (SW), 10 (NW), 15 (NE) and centre 20
    const junctions = new Set([0, 5, 10, 15, 20])

    return { nodes, edges, junctions }
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const size = opts.boardSize || 320
    const pointRadius = opts.pointRadius || 7
    const { nodes, edges, junctions } = this.getNodes(size, ox, oy)
    const parts = []

    parts.push(`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="${colors.background}" rx="4"/>`)

    // Draw edges
    parts.push(`<g fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linecap="round">`)
    for (const [a, b] of edges) {
      parts.push(`<line x1="${nodes[a].x}" y1="${nodes[a].y}" x2="${nodes[b].x}" y2="${nodes[b].y}"/>`)
    }
    parts.push('</g>')

    // Draw nodes
    parts.push(`<g>`)
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i]
      const isJunction = junctions.has(i)
      const isCentre = i === 20
      const fill = isCentre ? colors.centre : isJunction ? colors.junction : colors.point
      const r = isCentre ? pointRadius * 1.4 : isJunction ? pointRadius * 1.2 : pointRadius
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}"/>`)
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${r * 2}" fill="transparent" class="board-cell" data-sq="n${i + 1}" data-type="node"/>`)
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
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const sq = `n${i + 1}`
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointRadius}"/>`)
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointRadius * 2}" fill="transparent" class="board-cell" data-sq="${sq}" data-type="node"/>`)
    }
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

// ─── ASALTO PROVIDER ───────────────────────────────────────────────────────

const asalto = {
  name: 'asalto',
  positionType: 'node',
  labelStyle: 'none',
  defaultColors: { background: '#f5e6c8', line: '#2a2a2a', point: '#2a2a2a', fortress: 'rgba(40,80,180,0.15)', fortressBorder: '#3355aa' },
  computeLayout(opts) {
    const size = opts.boardSize || 320
    return { boardW: size, boardH: size }
  },
  getNodes(size, ox, oy) {
    // Cross-shaped board: fortress (3×3 top) + plain (7-wide middle + 3-wide bottom arm)
    // 43 total positions matching reference images
    const nodes = []
    const edges = []
    const fortressNodes = new Set()

    const spacing = size / 10
    const topMargin = spacing * 0.8
    const leftMargin = (size - 6 * spacing) / 2

    // Define which columns exist per row
    const rowDefs = [
      { cols: [2, 3, 4], y: 0 },          // fortress row 0
      { cols: [2, 3, 4], y: 1 },          // fortress row 1
      { cols: [2, 3, 4], y: 2 },          // fortress row 2 / junction
      { cols: [0, 1, 2, 3, 4, 5, 6], y: 3 }, // plain wide
      { cols: [0, 1, 2, 3, 4, 5, 6], y: 4 },
      { cols: [0, 1, 2, 3, 4, 5, 6], y: 5 },
      { cols: [0, 1, 2, 3, 4, 5, 6], y: 6 },
      { cols: [2, 3, 4], y: 7 },          // plain bottom arm
      { cols: [2, 3, 4], y: 8 },
    ]

    // Build node positions
    const nodeMap = {} // "row,col" → index
    for (const row of rowDefs) {
      for (const col of row.cols) {
        const x = ox + leftMargin + col * spacing
        const y = oy + topMargin + row.y * spacing
        const idx = nodes.length
        nodeMap[`${row.y},${col}`] = idx
        nodes.push({ x, y })
        if (row.y <= 2) fortressNodes.add(idx)
      }
    }

    // Build edges: orthogonal connections between adjacent nodes in same row or column
    for (const row of rowDefs) {
      for (let i = 0; i < row.cols.length - 1; i++) {
        const c1 = row.cols[i], c2 = row.cols[i + 1]
        if (c2 - c1 === 1) {
          edges.push([nodeMap[`${row.y},${c1}`], nodeMap[`${row.y},${c2}`]])
        }
      }
    }
    // Vertical connections
    for (let ri = 0; ri < rowDefs.length - 1; ri++) {
      const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
      for (const col of r1.cols) {
        if (r2.cols.includes(col)) {
          edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col}`]])
        }
      }
    }
    // Diagonal connections (both diagonals within each 2×2 cell)
    for (let ri = 0; ri < rowDefs.length - 1; ri++) {
      const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
      for (const col of r1.cols) {
        // Down-right diagonal
        if (r2.cols.includes(col + 1)) {
          edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col + 1}`]])
        }
        // Down-left diagonal
        if (r2.cols.includes(col - 1)) {
          edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col - 1}`]])
        }
      }
    }

    return { nodes, edges, fortressNodes, nodeMap }
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const size = opts.boardSize || 320
    const pointRadius = opts.pointRadius || 6
    const { nodes, edges, fortressNodes, nodeMap } = this.getNodes(size, ox, oy)
    const parts = []

    parts.push(`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="${colors.background}" rx="4"/>`)

    // Draw fortress background
    const fNodes = [...fortressNodes].map(i => nodes[i])
    if (fNodes.length > 0) {
      const fx = Math.min(...fNodes.map(n => n.x)) - pointRadius * 2
      const fy = Math.min(...fNodes.map(n => n.y)) - pointRadius * 2
      const fw = Math.max(...fNodes.map(n => n.x)) - fx + pointRadius * 4
      const fh = Math.max(...fNodes.map(n => n.y)) - fy + pointRadius * 4
      parts.push(`<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="${colors.fortress}" stroke="${colors.fortressBorder}" stroke-width="1.5" rx="3"/>`)
    }

    // Draw edges
    parts.push(`<g fill="none" stroke="${colors.line}" stroke-width="2" stroke-linecap="round">`)
    for (const [a, b] of edges) {
      parts.push(`<line x1="${nodes[a].x}" y1="${nodes[a].y}" x2="${nodes[b].x}" y2="${nodes[b].y}"/>`)
    }
    parts.push('</g>')

    // Draw nodes
    parts.push(`<g fill="${colors.point}">`)
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i]
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointRadius}" fill="${colors.point}"/>`)
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${pointRadius * 2}" fill="transparent" class="board-cell" data-sq="n${i + 1}" data-type="node"/>`)
    }
    parts.push('</g>')

    // Draw setup pieces if configured
    const setup = opts.asaltoSetup
    if (setup) {
      const pieceR = pointRadius * 1.5
      if (setup.officers) {
        for (const idx of setup.officers) {
          parts.push(`<circle cx="${nodes[idx].x}" cy="${nodes[idx].y}" r="${pieceR}" fill="#cc2222" stroke="#881111" stroke-width="1.5"/>`)
        }
      }
      if (setup.soldiers) {
        for (const idx of setup.soldiers) {
          parts.push(`<circle cx="${nodes[idx].x}" cy="${nodes[idx].y}" r="${pieceR}" fill="#44aa44" stroke="#227722" stroke-width="1.5"/>`)
        }
      }
    }

    return parts.join('')
  },
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
        const sq = String.fromCharCode(97 + c) + (rows - r)
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="3" fill="${colors.gridLine}"/>`)
        parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="${tileSize * 0.4}" fill="transparent" class="board-cell" data-sq="${sq}"/>`)
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

    if (boardShape === 'ellipse') {
      const pitSpacing = pitRadius * 2.96
      const pitSpan = (pitsPerSide - 1) * pitSpacing
      const rowOffset = pitRadius * 2
      const storeGap = 2
      const storeCenterOffset = hasStores ? pitSpan / 2 + pitRadius + storeGap + storeRx : 0
      const outerRx = (hasStores ? storeCenterOffset + storeRx : pitSpan / 2 + pitRadius) + pitRadius * 2.67
      const outerRy = rowOffset + pitRadius * 2.22
      const boardW = Math.round(2 * (outerRx + pitRadius * 0.67))
      const boardH = Math.round(2 * (outerRy + pitRadius * 0.78))
      return { boardW, boardH, pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, pitSpacing, pitSpan, rowOffset, storeCenterOffset, outerRx, outerRy }
    }

    const pad = opts.padEdge || pitRadius * 1.65
    const frameInset = 16
    const interRow = pitRadius * 2.4
    const divGap = boardRows === 4 ? pitRadius * 2.7 : 0

    const contentH = boardRows === 4
      ? interRow * 2 + divGap
      : interRow * (boardRows - 1)
    const boardH = contentH + pad * 2 + frameInset * 2

    const storeWidth = hasStores ? storeRx * 2 + 16 : 0
    const pitsAreaWidth = pitsPerSide * (pitRadius * 2 + 10)
    const boardW = storeWidth * 2 + pitsAreaWidth + pad * 2 + frameInset * 2

    return { boardW, boardH, pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, storeWidth, rx, pad, frameInset, interRow, divGap }
  },
  render(ctx) {
    const { colors, opts } = ctx
    const layout = this.computeLayout(opts)
    const { pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, boardW, boardH } = layout
    const parts = []

    if (boardShape === 'ellipse') {
      return this.renderEllipse(layout, colors, opts)
    }

    const { storeWidth, rx, pad, frameInset, interRow, divGap } = layout

    const bx = frameInset / 2, by = frameInset / 2
    const bw = boardW - frameInset, bh = boardH - frameInset

    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${rx}" ry="${rx}" fill="${colors.boardOuter}"/>`)
    parts.push(`<rect x="${bx + 6}" y="${by + 6}" width="${bw - 12}" height="${bh - 12}" rx="${rx - 4}" ry="${rx - 4}" fill="${colors.boardInner}"/>`)
    if (colors.border) {
      const dashAttr = colors.borderDash ? ` stroke-dasharray="${colors.borderDash}"` : ''
      parts.push(`<rect x="${bx + 12}" y="${by + 12}" width="${bw - 24}" height="${bh - 24}" rx="${rx - 8}" ry="${rx - 8}" fill="none" stroke="${colors.border}" stroke-width="1.5"${dashAttr}/>`)
    }

    if (hasStores) {
      const storeCy = boardH / 2
      const leftX = frameInset + storeWidth / 2
      const rightX = boardW - frameInset - storeWidth / 2
      parts.push(`<ellipse cx="${leftX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-1"/>`)
      parts.push(`<ellipse cx="${rightX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-0"/>`)
    }

    const pitsLeftEdge = frameInset + (hasStores ? storeWidth : 0) + pad
    const pitsRightEdge = boardW - frameInset - (hasStores ? storeWidth : 0) - pad
    const pitsAvailWidth = pitsRightEdge - pitsLeftEdge
    const pitSpacing = pitsPerSide > 1 ? pitsAvailWidth / (pitsPerSide - 1) : 0

    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const markers = opts.markers || []
    const markerSet = new Set(markers)
    const pitCurve = opts.pitCurve || 0

    const topPitCenter = frameInset + pad
    const botPitCenter = boardH - frameInset - pad
    const rowCenters = []
    if (boardRows === 2) {
      rowCenters.push(topPitCenter, botPitCenter)
    } else if (boardRows === 4) {
      rowCenters.push(
        topPitCenter,
        topPitCenter + interRow,
        botPitCenter - interRow,
        botPitCenter
      )
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
          cy += isTopHalf ? curveOffset : -curveOffset
        }

        parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${pitIdx}"/>`)

        if (markerSet.has(pitIdx)) {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
        }

        const seedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[pitIdx] : seedsPerPit
        if (seedCount > 0) {
          parts.push(renderMancalaPieces(cx, cy, seedCount, pitRadius, seedRadius, colors, opts.pieceImages))
        }
      }
    }

    if (boardRows === 4) {
      const divY = boardH / 2
      parts.push(`<line x1="${pitsLeftEdge - pitRadius}" y1="${divY}" x2="${pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius}" y2="${divY}" stroke="${colors.boardOuter}" stroke-width="2.5" stroke-dasharray="6,4"/>`)
    }

    return parts.join('')
  },
  renderEllipse(layout, colors, opts) {
    const { boardW, boardH, pitsPerSide, hasStores, pitRadius, storeRx, storeRy, pitSpacing, rowOffset, storeCenterOffset, outerRx, outerRy } = layout
    const parts = []
    const cx = boardW / 2, cy = boardH / 2

    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${outerRx}" ry="${outerRy}" fill="${colors.boardOuter}"/>`)
    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${outerRx - 8}" ry="${outerRy - 8}" fill="${colors.boardInner}"/>`)

    if (hasStores) {
      const leftX = cx - storeCenterOffset
      const rightX = cx + storeCenterOffset
      parts.push(`<ellipse cx="${leftX}" cy="${cy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-1"/>`)
      parts.push(`<ellipse cx="${rightX}" cy="${cy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-0"/>`)
    }

    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const markers = opts.markers || []
    const markerSet = new Set(markers)
    const pitCurve = opts.pitCurve || 0
    const topCy = cy - rowOffset
    const botCy = cy + rowOffset

    for (let i = 0; i < pitsPerSide; i++) {
      const px = cx + (i - (pitsPerSide - 1) / 2) * pitSpacing

      let topY = topCy, botY = botCy
      if (pitCurve) {
        const t = (i - (pitsPerSide - 1) / 2) / ((pitsPerSide - 1) / 2)
        const curveOffset = pitCurve * t * t
        topY += curveOffset
        botY -= curveOffset
      }

      const topIdx = pitsPerSide - 1 - i
      const botIdx = i
      parts.push(`<circle cx="${px}" cy="${topY}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${topIdx}"/>`)
      parts.push(`<circle cx="${px}" cy="${botY}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${pitsPerSide + botIdx}"/>`)

      if (markerSet.has(topIdx)) {
        parts.push(`<circle cx="${px}" cy="${topY}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
      }
      if (markerSet.has(pitsPerSide + botIdx)) {
        parts.push(`<circle cx="${px}" cy="${botY}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
      }

      const topSeedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[topIdx] : seedsPerPit
      const botSeedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[pitsPerSide + botIdx] : seedsPerPit
      if (topSeedCount > 0) parts.push(renderMancalaPieces(px, topY, topSeedCount, pitRadius, seedRadius, colors, opts.pieceImages))
      if (botSeedCount > 0) parts.push(renderMancalaPieces(px, botY, botSeedCount, pitRadius, seedRadius, colors, opts.pieceImages))
    }

    return parts.join('')
  },
}

function renderMancalaPieces(cx, cy, count, pitRadius, seedRadius, colors, pieceImages) {
  if (pieceImages && pieceImages[String(count)]) {
    const size = pitRadius * 1.6
    return `<image href="${pieceImages[String(count)]}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" pointer-events="none"/>`
  }
  return renderSeeds(cx, cy, count, seedRadius, colors)
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

// ─── BACKGAMMON PROVIDER ────────────────────────────────────────────────────

const backgammon = {
  name: 'backgammon',
  positionType: 'point',
  labelStyle: 'none',
  defaultColors: {
    frame: '#3d2b1f', felt: '#1a5c3a',
    pointA: '#c47e3b', pointB: '#8b2500',
    dark: '#333', darkStroke: '#111', darkRing: '#555',
    light: '#eee', lightStroke: '#999', lightRing: '#ccc',
  },
  computeLayout(opts) {
    const frameW = 16
    const barW = 24
    const pointW = 32
    const panelW = pointW * 6
    const boardW = frameW * 2 + panelW * 2 + barW
    const boardH = 320
    const panelH = boardH - frameW * 2
    const pointH = Math.round(panelH * 0.417)
    return { boardW, boardH, frameW, barW, pointW, panelW, panelH, pointH }
  },
  render(ctx) {
    const { colors, opts } = ctx
    const layout = this.computeLayout(opts)
    const { boardW, boardH, frameW, barW, pointW, panelW, panelH, pointH } = layout
    const parts = []

    parts.push(`<rect x="0" y="0" width="${boardW}" height="${boardH}" rx="6" ry="6" fill="${colors.frame}"/>`)
    parts.push(`<rect x="${frameW}" y="${frameW}" width="${panelW}" height="${panelH}" fill="${colors.felt}"/>`)
    parts.push(`<rect x="${frameW + panelW + barW}" y="${frameW}" width="${panelW}" height="${panelH}" fill="${colors.felt}"/>`)
    parts.push(`<rect x="${frameW + panelW}" y="0" width="${barW}" height="${boardH}" fill="${colors.frame}"/>`)

    const bottomBase = boardH - frameW
    const topBase = frameW

    for (let i = 0; i < 24; i++) {
      const quadrant = Math.floor(i / 6)
      const posInQuad = i % 6
      const isBottom = quadrant === 0 || quadrant === 1
      const isRight = quadrant === 0 || quadrant === 3
      const panelX = isRight ? frameW + panelW + barW : frameW
      const ptColor = ((posInQuad % 2 === 0) === isBottom) ? colors.pointA : colors.pointB

      let lx
      if (isBottom) {
        lx = isRight
          ? panelX + panelW - (posInQuad + 1) * pointW
          : panelX + panelW - (posInQuad + 1) * pointW
      } else {
        lx = isRight
          ? panelX + posInQuad * pointW
          : panelX + posInQuad * pointW
      }

      const x1 = lx, x2 = lx + pointW, tipX = lx + pointW / 2

      if (isBottom) {
        const baseY = bottomBase
        const tipY = bottomBase - pointH
        parts.push(`<polygon points="${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}" fill="${ptColor}" class="board-cell" data-sq="point-${i + 1}"/>`)
      } else {
        const baseY = topBase
        const tipY = topBase + pointH
        parts.push(`<polygon points="${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}" fill="${ptColor}" class="board-cell" data-sq="point-${i + 1}"/>`)
      }
    }

    const setup = opts.parsedSetup || opts.setup
    if (setup) {
      parts.push(this.renderCheckers(setup, layout, opts))
    }

    return parts.join('')
  },
  renderCheckers(setup, layout, opts) {
    const { boardW, boardH, frameW, barW, pointW, panelW, pointH } = layout
    const parts = []
    const pieceSize = 22
    const pieceSpacing = 22
    const bottomBase = boardH - frameW
    const topBase = frameW
    const pieceImages = opts.pieceImages || {}
    const darkImg = pieceImages.bM || pieceImages.b || null
    const lightImg = pieceImages.wM || pieceImages.w || null

    for (let i = 0; i < 24; i++) {
      const dark = setup.dark ? (setup.dark[i] || 0) : 0
      const light = setup.light ? (setup.light[i] || 0) : 0
      if (!dark && !light) continue

      const quadrant = Math.floor(i / 6)
      const posInQuad = i % 6
      const isBottom = quadrant === 0 || quadrant === 1
      const isRight = quadrant === 0 || quadrant === 3
      const panelX = isRight ? frameW + panelW + barW : frameW

      let lx
      if (isBottom) {
        lx = isRight
          ? panelX + panelW - (posInQuad + 1) * pointW
          : panelX + panelW - (posInQuad + 1) * pointW
      } else {
        lx = isRight
          ? panelX + posInQuad * pointW
          : panelX + posInQuad * pointW
      }
      const cx = lx + pointW / 2

      const renderStack = (count, img, isDarkPiece, startY, dir) => {
        const maxShow = 5
        const show = Math.min(count, maxShow)
        const overflow = count > maxShow ? count - (maxShow - 1) : 0
        for (let j = 0; j < show; j++) {
          const cy = startY + dir * j * pieceSpacing
          if (img) {
            parts.push(`<image href="${img}" x="${cx - pieceSize / 2}" y="${cy - pieceSize / 2}" width="${pieceSize}" height="${pieceSize}"/>`)
          } else {
            parts.push(`<circle cx="${cx}" cy="${cy}" r="${pieceSize / 2 - 1}" fill="${isDarkPiece ? '#191716' : '#F8F6F2'}" stroke="${isDarkPiece ? '#4d433a' : '#5E5854'}" stroke-width="1.5"/>`)
          }
          if (j === 0 && overflow > 0) {
            const textFill = isDarkPiece ? '#fff' : '#333'
            parts.push(`<text x="${cx}" y="${cy + 4}" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="${textFill}">${overflow}</text>`)
          }
        }
      }

      if (dark > 0) {
        const startY = isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2
        const dir = isBottom ? -1 : 1
        renderStack(dark, darkImg, true, startY, dir)
      }
      if (light > 0) {
        const startY = isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2
        const dir = isBottom ? -1 : 1
        renderStack(light, lightImg, false, startY, dir)
      }
    }

    return parts.join('')
  },
}

const sternHalma = {
  name: 'stern-halma',
  positionType: 'node',
  labelStyle: 'none',
  defaultColors: {
    boardBody: '#4a3728', boardRim: '#5c4636', boardFelt: '#2d5c3d',
    centre: '#e8dcc8', outline: '#6b5a40',
    armN: '#f2e8d4', armNE: '#d4e4f0', armSE: '#e8d8ec',
    armS: '#f2e8d4', armSW: '#d4e4f0', armNW: '#e8d8ec',
    hole: '#3a2c1c',
  },
  computeLayout(opts) {
    const spacing = opts.holeSpacing || 24
    const rim = spacing * 1.2
    const margin = spacing * 2.5
    const innerW = spacing * 16 + margin * 2
    const innerH = Math.round(spacing * Math.sqrt(3) / 2 * 16) + margin * 2 + spacing
    const boardW = innerW + rim * 2
    const boardH = innerH + rim * 2
    return { boardW, boardH, innerW, innerH, rim }
  },
  getHolePositions(opts, ox, oy) {
    const spacing = opts.holeSpacing || 24
    const rowH = spacing * Math.sqrt(3) / 2
    const rim = spacing * 1.2
    const margin = spacing * 2.5
    const cx = ox + rim + spacing * 8 + margin
    const topY = oy + rim + margin + spacing * 0.5
    const rowWidths = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]
    const positions = []
    const arms = { N: [], NE: [], SE: [], S: [], SW: [], NW: [] }

    for (let row = 0; row < 17; row++) {
      const w = rowWidths[row]
      const y = topY + row * rowH
      const startX = cx - (w - 1) * spacing / 2
      for (let i = 0; i < w; i++) {
        const x = startX + i * spacing
        const idx = positions.length
        positions.push({ x, y, row, col: i })
        if (row < 4) arms.N.push(idx)
        else if (row >= 13) arms.S.push(idx)
        else if (row >= 4 && row <= 7) {
          const armWidth = 4 - (row - 4)
          if (i < armWidth) arms.NW.push(idx)
          else if (i >= w - armWidth) arms.NE.push(idx)
        } else if (row >= 9 && row <= 12) {
          const armWidth = row - 8
          if (i < armWidth) arms.SW.push(idx)
          else if (i >= w - armWidth) arms.SE.push(idx)
        }
      }
    }
    return { positions, arms, cx, topY, rowH, spacing }
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const layout = this.computeLayout(opts)
    const { boardW, boardH, innerW, innerH, rim } = layout
    const { positions, arms, cx, topY, rowH, spacing } = this.getHolePositions(opts, ox, oy)
    const parts = []

    parts.push(`<defs>`)
    parts.push(`<filter id="board-shadow" x="-5%" y="-3%" width="110%" height="110%">`)
    parts.push(`<feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.35)"/>`)
    parts.push(`</filter>`)
    parts.push(`</defs>`)

    parts.push(`<rect x="${ox}" y="${oy}" width="${boardW}" height="${boardH}" fill="${colors.boardBody}" rx="18" filter="url(#board-shadow)"/>`)
    parts.push(`<rect x="${ox + 3}" y="${oy + 3}" width="${boardW - 6}" height="${boardH - 6}" fill="${colors.boardRim}" rx="15"/>`)
    parts.push(`<rect x="${ox + rim}" y="${oy + rim}" width="${innerW}" height="${innerH}" fill="${colors.boardFelt}" rx="6"/>`)

    const s = spacing / 24
    const midY = topY + 8 * rowH
    const pieceR = spacing * 0.19
    const polyScale = 1.04

    const hex = [[-50.5, -93], [50.5, -93], [104.3, 0], [50.5, 92.9], [-50.5, 92.9], [-104.3, 0]]
      .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
    const tips = [[0, -180.3], [158, -93], [158, 92.9], [0, 180.3], [-158, 92.9], [-158, -93]]
      .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))

    parts.push(`<polygon points="${hex.map(v => `${v.x},${v.y}`).join(' ')}" fill="${colors.centre}"/>`)

    const armFills = [colors.armN, colors.armNE, colors.armSE, colors.armS, colors.armSW, colors.armNW]
    for (let i = 0; i < 6; i++) {
      parts.push(`<polygon points="${tips[i].x},${tips[i].y} ${hex[i].x},${hex[i].y} ${hex[(i + 1) % 6].x},${hex[(i + 1) % 6].y}" fill="${armFills[i]}"/>`)
    }

    parts.push(`<polygon points="${tips[0].x},${tips[0].y} ${tips[4].x},${tips[4].y} ${tips[2].x},${tips[2].y}" fill="none" stroke="${colors.outline}" stroke-width="1.5"/>`)
    parts.push(`<polygon points="${tips[3].x},${tips[3].y} ${tips[5].x},${tips[5].y} ${tips[1].x},${tips[1].y}" fill="none" stroke="${colors.outline}" stroke-width="1.5"/>`)

    const filledArms = opts.filledArms || []
    const pieceImages = opts.pieceImages || {}
    const armPieceKeys = ['red-circle', 'blue-circle', 'green-circle', 'black-circle', 'purple-circle', 'brown-circle']
    const armColors = ['#d32f2f', '#1565c0', '#2e7d32', '#1a1a1a', '#6a1b9a', '#5d4037']

    const holeArm = new Array(positions.length).fill('')
    for (const [armName, idxs] of Object.entries(arms)) {
      for (const idx of idxs) holeArm[idx] = armName
    }

    parts.push(`<g fill="${colors.hole}" opacity="0.7">`)
    for (let i = 0; i < positions.length; i++) {
      const hp = positions[i]
      const arm = holeArm[i]
      const armAttr = arm ? ` data-arm="${arm}"` : ''
      parts.push(`<circle cx="${hp.x}" cy="${hp.y}" r="2.5"/>`)
      parts.push(`<circle cx="${hp.x}" cy="${hp.y}" r="${pieceR}" fill="transparent" class="board-cell" data-sq="h${i + 1}" data-type="${arm ? 'arm-' + arm : 'centre'}"${armAttr}/>`)
    }
    parts.push('</g>')

    const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
    const pieceSz = pieceR * 1.6
    for (let a = 0; a < filledArms.length; a++) {
      const armName = filledArms[a]
      const holeIdxs = arms[armName]
      const colorIdx = armOrder.indexOf(armName)
      const imgKey = armPieceKeys[colorIdx]
      const img = pieceImages[imgKey] || null
      const color = armColors[colorIdx] || armColors[a]
      for (const idx of holeIdxs) {
        const hp = positions[idx]
        if (img) {
          parts.push(`<image href="${img}" x="${hp.x - pieceSz / 2}" y="${hp.y - pieceSz / 2}" width="${pieceSz}" height="${pieceSz}"/>`)
        } else {
          parts.push(`<circle cx="${hp.x}" cy="${hp.y}" r="${pieceR - 1}" fill="${color}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>`)
        }
      }
    }

    const labelPad = spacing * 1.0
    const labels = [
      { text: 'N', x: cx, y: tips[0].y - labelPad },
      { text: 'S', x: cx, y: tips[3].y + labelPad + 5 },
      { text: 'NE', x: tips[1].x + labelPad, y: tips[1].y + 4 },
      { text: 'NW', x: tips[5].x - labelPad, y: tips[5].y + 4 },
      { text: 'SE', x: tips[2].x + labelPad, y: tips[2].y + 4 },
      { text: 'SW', x: tips[4].x - labelPad, y: tips[4].y + 4 },
    ]
    parts.push(`<g font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.7)" font-weight="600" text-anchor="middle">`)
    for (const l of labels) parts.push(`<text x="${l.x}" y="${l.y}">${l.text}</text>`)
    parts.push('</g>')

    return parts.join('')
  },
}

// ─── LANDLORDS PROVIDER ─────────────────────────────────────────────────────

const LANDLORDS_THEMES = {
  '1904-patent': {
    board: '#f0e4c8', border: '#5a4a30', innerBg: '#f0e4c8',
    spaceStroke: '#5a4a30', cornerStroke: '#5a4a30',
    text: '#3a2a15', titleText: '#3a2a15',
    lot: '#f0e4c8', necessity: '#f0e4c8', railroad: '#f0e4c8',
    franchise: '#f0e4c8', luxury: '#f0e4c8', legacy: '#f0e4c8',
    'go-to-jail': '#e8d8b8', corner: '#e8d8b8',
  },
  '1906-egc': {
    board: '#f5edd5', border: '#6b2020', innerBg: '#f8f4e8',
    spaceStroke: '#3a3020', cornerStroke: '#3a3020',
    text: '#2a2015', titleText: '#2a2015',
    lot: '#6a9a50', necessity: '#7aaac0', railroad: '#d4889a',
    franchise: '#d4c060', chance: '#cc3030', luxury: '#d4889a',
    special: '#7aaac0', 'go-to-jail': '#d4883a', corner: '#d4c898',
    broker: '#d4c060',
  },
  '1932-prosperity': {
    board: '#f8f4ec', border: '#2a4a7a', innerBg: '#f8f4ec',
    spaceStroke: '#2a4a7a', cornerStroke: '#2a4a7a',
    text: '#1a2a40', titleText: '#6b2020',
    lot: '#ffffff', taxes: '#ffffff', franchise: '#ffffff',
    railroad: '#ffffff', luxury: '#ffffff', broker: '#ffffff',
    jail: '#ffffff', corner: '#ffffff', 'go-to-jail': '#ffffff',
    lotStripe: '#3a8a3a', taxesStripe: '#2a5a9a', franchiseStripe: '#d4a030',
    railroadStripe: '#3a8a3a',
    brokerStripe: '#c8b020', luxuryStripe: '#d4708a',
    jailStripe: '#808080', 'go-to-jailStripe': '#808080',
    cornerArc: '#8c2020',
  },
}

const LANDLORDS_CATEGORIES = {
  lot: 'Land In Use', necessity: 'Absolute Necessity', taxes: 'Personal Property',
  railroad: 'Interstate Public Utility', franchise: 'Local Public Utility',
  broker: 'Real Estate', luxury: 'Luxury', jail: 'Jail',
  'go-to-jail': 'No Trespassing', chance: 'Chance', special: 'Speculation',
  legacy: 'Legacy',
}

const landlords = {
  name: 'landlords',
  positionType: 'track',
  labelStyle: 'none',
  defaultColors: {},
  computeLayout(opts) {
    const variant = opts.variant || '1904-patent'
    const boardData = opts.boardData || null
    const board = boardData ? boardData.boards[variant] : null
    const totalSpaces = board ? board.totalSpaces : (variant === '1932-prosperity' ? 36 : 40)
    const corners = 4
    const perSide = (totalSpaces - corners) / 4
    const spaceW = opts.spaceWidth || 56
    const cornerSize = opts.cornerSize || 80
    const boardW = cornerSize * 2 + perSide * spaceW
    const boardH = boardW
    return { boardW, boardH, spaceW, cornerSize, perSide, totalSpaces }
  },
  render(ctx) {
    const { opts } = ctx
    const variant = opts.variant || '1904-patent'
    const boardData = opts.boardData || null
    const board = boardData ? boardData.boards[variant] : null
    if (!board) {
      return `<rect x="0" y="0" width="400" height="60" fill="#f5e6c8"/><text x="200" y="35" text-anchor="middle" font-size="12" fill="#888">No board data for "${variant}"</text>`
    }

    const theme = LANDLORDS_THEMES[variant] || LANDLORDS_THEMES['1904-patent']
    const layout = this.computeLayout(opts)
    const { boardW, boardH, cornerSize } = layout
    const parts = []

    parts.push(`<rect x="0" y="0" width="${boardW}" height="${boardH}" fill="${theme.board}"/>`)
    parts.push(`<rect x="2" y="2" width="${boardW - 4}" height="${boardH - 4}" fill="none" stroke="${theme.border}" stroke-width="2.5"/>`)

    const spaces = board.spaces
    const sideSpaces = { bottom: [], left: [], top: [], right: [] }
    for (const s of spaces) {
      if (s.side !== 'corner' && sideSpaces[s.side]) {
        sideSpaces[s.side].push(s)
      }
    }

    const cornerOrder = this._getCornerOrder(variant, spaces)
    const cornerPositions = [
      { x: boardW - cornerSize, y: boardH - cornerSize },
      { x: 0, y: boardH - cornerSize },
      { x: 0, y: 0 },
      { x: boardW - cornerSize, y: 0 },
    ]
    for (let ci = 0; ci < 4; ci++) {
      const corner = cornerOrder[ci]
      const pos = cornerPositions[ci]
      parts.push(this._renderCorner(corner, pos.x, pos.y, cornerSize, theme, variant))
    }

    if (variant === '1904-patent') {
      for (let ci = 0; ci < 4; ci++) {
        const corner = cornerOrder[ci]
        const pos = cornerPositions[ci]
        parts.push(this._render1904Medallion(corner, pos.x, pos.y, cornerSize, theme))
      }
    }

    const sideOrder = ['bottom', 'left', 'top', 'right']
    for (let si = 0; si < 4; si++) {
      const side = sideOrder[si]
      const sideArr = sideSpaces[side]
      if (!sideArr.length) continue
      for (let i = 0; i < sideArr.length; i++) {
        const space = sideArr[i]
        const rect = this._getSpaceRect(side, i, sideArr.length, cornerSize, boardW, boardH)
        parts.push(this._renderSpace(space, rect, side, theme, variant))
      }
    }

    if (variant === '1904-patent') {
      for (let ci = 0; ci < 4; ci++) {
        const corner = cornerOrder[ci]
        const pos = cornerPositions[ci]
        parts.push(this._render1904MedallionText(corner, pos.x, pos.y, cornerSize, theme))
      }
    }

    parts.push(this._renderInner(board, cornerSize, boardW, boardH, theme, variant))

    return parts.join('')
  },
  _getCornerOrder(variant, spaces) {
    const corners = spaces.filter(s => s.side === 'corner')
    if (variant === '1932-prosperity') return [corners[1], corners[2], corners[3], corners[0]]
    if (variant === '1906-egc') return [corners[3], corners[0], corners[1], corners[2]]
    return [corners[0], corners[1], corners[2], corners[3]]
  },
  _getSpaceRect(side, idx, count, cornerSize, boardW, boardH) {
    const spanW = boardW - cornerSize * 2
    const spanH = boardH - cornerSize * 2
    const cellW = spanW / count
    const cellH = spanH / count

    if (side === 'bottom') {
      return { x: boardW - cornerSize - (idx + 1) * cellW, y: boardH - cornerSize, w: cellW, h: cornerSize }
    }
    if (side === 'left') {
      return { x: 0, y: boardH - cornerSize - (idx + 1) * cellH, w: cornerSize, h: cellH }
    }
    if (side === 'top') {
      return { x: cornerSize + idx * cellW, y: 0, w: cellW, h: cornerSize }
    }
    if (side === 'right') {
      return { x: boardW - cornerSize, y: cornerSize + idx * cellH, w: cornerSize, h: cellH }
    }
    return { x: 0, y: 0, w: cellW, h: cellH }
  },
  _renderCorner(space, x, y, size, theme, variant) {
    const parts = []
    const isGoToJail = space.notes && space.notes.includes('Go to Jail')
    const cornerFill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
    parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${cornerFill}" stroke="${theme.cornerStroke}" stroke-width="1.5" class="board-cell" data-sq="pos-${space.pos}" data-type="corner"/>`)

    if (variant === '1904-patent') {
      // medallion rendered in second pass (after track cells) so it overlaps
    } else if (variant === '1906-egc' && space.split) {
      const sp = space.split
      const spColor = theme[sp.type] || theme.corner
      const mainColor = theme.corner
      const isJail = space.name === 'JAIL'

      if (isJail) {
        parts.push(`<polygon points="${x},${y} ${x + size},${y} ${x + size},${y + size}" fill="${spColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}b" data-type="${sp.type}"/>`)
        parts.push(`<polygon points="${x},${y} ${x},${y + size} ${x + size},${y + size}" fill="${mainColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}a" data-type="corner"/>`)
        parts.push(`<line x1="${x}" y1="${y}" x2="${x + size}" y2="${y + size}" stroke="${theme.cornerStroke}" stroke-width="1"/>`)
        const q1x = x + size * 0.7, q1y = y + size * 0.3
        const q2x = x + size * 0.3, q2y = y + size * 0.7
        parts.push(`<text x="${q1x}" y="${q1y - 3}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sp.name)}</text>`)
        if (sp.tax) parts.push(`<text x="${q1x}" y="${q1y + 5}" text-anchor="middle" font-size="3.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">Tax $${sp.tax}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(space.name)}</text>`)
      } else {
        parts.push(`<polygon points="${x},${y} ${x + size},${y} ${x},${y + size}" fill="${spColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}b" data-type="${sp.type}"/>`)
        parts.push(`<polygon points="${x + size},${y} ${x + size},${y + size} ${x},${y + size}" fill="${mainColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}a" data-type="corner"/>`)
        parts.push(`<line x1="${x}" y1="${y + size}" x2="${x + size}" y2="${y}" stroke="${theme.cornerStroke}" stroke-width="1"/>`)
        const q1x = x + size * 0.3, q1y = y + size * 0.3
        const q2x = x + size * 0.7, q2y = y + size * 0.7
        parts.push(`<text x="${q1x}" y="${q1y}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sp.name)}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y - 3}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(space.name)}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y + 5}" text-anchor="middle" font-size="3.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">Free</text>`)
      }
      parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${theme.cornerStroke}" stroke-width="1.5"/>`)
      return parts.join('')
    } else if (variant === '1932-prosperity') {
      const cx = x + size / 2, cy = y + size / 2
      const r = size * 0.42
      if (space.name === 'WAGES') {
        const colors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI / 2) - Math.PI / 2
          const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
          parts.push(`<path d="M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}" fill="none" stroke="${colors[i]}" stroke-width="4"/>`)
        }
      } else if (space.fare) {
        parts.push(`<path d="M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}" fill="none" stroke="${theme.cornerArc}" stroke-width="3.5"/>`)
      } else if (space.name === 'JAIL') {
        const bw = size * 0.85
        parts.push(`<rect x="${cx - bw/2}" y="${cy - bw/2}" width="${bw}" height="${bw}" fill="none" stroke="#4a4a4a" stroke-width="2"/>`)
        const bars = 4
        const gap = bw / (bars + 1)
        for (let i = 1; i <= bars; i++) {
          parts.push(`<line x1="${cx - bw/2 + i * gap}" y1="${cy - bw/2 + 2}" x2="${cx - bw/2 + i * gap}" y2="${cy + bw/2 - 2}" stroke="#3a3a3a" stroke-width="1.5"/>`)
        }
      }
    }

    const cx = x + size / 2, cy = y + size / 2
    if (variant === '1904-patent') {
      // text rendered in _render1904Medallion (second pass)
    } else {
      const lines = this._wrapText(space.name, 10)
      const lineH = size > 70 ? 11 : 9
      const nameY = cy - 8
      for (let i = 0; i < lines.length; i++) {
        parts.push(`<text x="${cx}" y="${nameY + i * lineH}" text-anchor="middle" font-size="${size > 70 ? 8 : 7}" font-weight="bold" font-family="sans-serif" fill="${theme.titleText}" dominant-baseline="central">${esc(lines[i])}</text>`)
      }
      let subtext = ''
      if (space.fare) subtext = `Fare $${space.fare}`
      else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
      if (subtext) {
        parts.push(`<text x="${cx}" y="${cy + lines.length * lineH / 2 + 8}" text-anchor="middle" font-size="5.5" font-family="sans-serif" fill="${theme.text}" dominant-baseline="central">${esc(subtext)}</text>`)
      }
    }
    return parts.join('')
  },
  _render1904Medallion(space, x, y, size, theme) {
    const parts = []
    const cx = x + size / 2, cy = y + size / 2
    const r = size * 0.72
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.corner}" stroke="${theme.cornerStroke}" stroke-width="1.5"/>`)
    return parts.join('')
  },
  _render1904MedallionText(space, x, y, size, theme) {
    const parts = []
    const cx = x + size / 2, cy = y + size / 2
    const r = size * 0.72

    const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
    const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
    const lines = this._wrapText(space.name, maxChars)
    const lineH = fontSize + 3
    const blockH = lines.length * lineH
    const startY = cy - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
    for (let i = 0; i < lines.length; i++) {
      parts.push(`<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${theme.titleText}" dominant-baseline="central">${esc(lines[i])}</text>`)
    }
    if (space.notes) {
      const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
      parts.push(`<text x="${cx}" y="${startY + blockH + 4}" text-anchor="middle" font-size="4.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sub)}</text>`)
    }
    return parts.join('')
  },
  _renderSpace(space, rect, side, theme, variant) {
    const parts = []
    const { x, y, w, h } = rect
    const typeFill = theme[space.type] || '#f0f0f0'
    const strokeW = variant === '1904-patent' ? 1.5 : 0.75
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${typeFill}" stroke="${theme.spaceStroke}" stroke-width="${strokeW}" class="board-cell" data-sq="pos-${space.pos}" data-type="${space.type}"/>`)

    if (variant === '1932-prosperity') {
      this._render1932Stripes(parts, space, x, y, w, h, side, theme)
    }

    const cx = x + w / 2, cy = y + h / 2
    const rotate = 0
    const textW = w
    const textH = h

    const textParts = []
    if (variant === '1932-prosperity') {
      this._render1932Text(textParts, space, textW, textH, theme)
    } else if (variant === '1906-egc') {
      this._render1906Text(textParts, space, textW, textH, theme)
    } else {
      this._render1904Text(textParts, space, textW, textH, theme)
    }

    parts.push(`<g transform="translate(${cx},${cy}) rotate(${rotate})">${textParts.join('')}</g>`)
    return parts.join('')
  },
  _render1932Stripes(parts, space, x, y, w, h, side, theme) {
    const stripeKey = space.type + 'Stripe'
    const stripeColor = theme[stripeKey]
    if (!stripeColor) return

    const bandRatio = 0.22
    const lineW = 1.2

    if (side === 'bottom') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    } else if (side === 'top') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    } else if (side === 'right' || side === 'left') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    }
  },
  _render1932Text(textParts, space, textW, textH, theme) {
    const category = LANDLORDS_CATEGORIES[space.type] || ''
    const narrow = textW < textH
    const fontSize = narrow ? 5 : 6
    const catSize = narrow ? 3.2 : 3.8
    const detSize = narrow ? 3.5 : 4
    const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'

    textParts.push(`<text text-anchor="end" font-size="3" font-family="sans-serif" fill="${theme.text}" opacity="0.6" x="${textW * 0.44}" y="${-textH * 0.38}">${space.pos}</text>`)

    if (category) {
      textParts.push(`<text text-anchor="middle" font-size="${catSize}" font-family="sans-serif" fill="${theme.text}" x="0" y="${-textH * 0.39}">${esc(category)}</text>`)
    }
    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" fill="${theme.text}" x="0" y="${category ? 2 : 0}">${esc(name)}</text>`)

    let detail = ''
    if (space.rent) detail = `Land Rent $${space.rent}`
    else if (space.tax) detail = `$${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.price && space.type === 'franchise') detail = `$${space.price}`
    if (detail) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="sans-serif" fill="${theme.text}" x="0" y="${textH * 0.39}">${esc(detail)}</text>`)
    }
  },
  _render1906Text(textParts, space, textW, textH, theme) {
    const narrow = textW < textH
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    const textColor = space.type === 'chance' ? '#fff' : theme.text

    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${textColor}" x="0" y="${narrow ? -2 : -4}">${esc(name)}</text>`)

    let detail = ''
    if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
    else if (space.price) detail = `$${space.price}`
    else if (space.rent) detail = `Rent $${space.rent}`
    else if (space.tax) detail = `Tax $${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.fee) detail = `Fee $${space.fee}`
    if (detail) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="serif" fill="${textColor}" x="0" y="${narrow ? 6 : 8}">${esc(detail)}</text>`)
    }
  },
  _render1904Text(textParts, space, textW, textH, theme) {
    const narrow = textW < textH
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'

    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${theme.text}" x="0" y="${narrow ? -4 : -6}">${esc(name)}</text>`)

    const lines = []
    if (space.rent) lines.push(`Rent $${space.rent}`)
    if (space.price) lines.push(`Sale $${space.price}`)
    if (space.tax) lines.push(`Tax $${space.tax}`)
    if (space.fare) lines.push(`Fare $${space.fare}`)
    if (space.fee) lines.push(`Fee $${space.fee}`)
    if (space.receive) lines.push(`+$${space.receive}`)
    const lineH = narrow ? 6 : 8
    for (let i = 0; i < lines.length; i++) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="serif" fill="${theme.text}" x="0" y="${(narrow ? 3 : 4) + i * lineH}">${esc(lines[i])}</text>`)
    }
  },
  _renderInner(board, cornerSize, boardW, boardH, theme, variant) {
    const parts = []
    const innerX = cornerSize, innerY = cornerSize
    const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
    parts.push(`<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="${theme.innerBg}"/>`)

    const cx = boardW / 2, cy = boardH / 2

    if (variant === '1932-prosperity') {
      const r = innerW * 0.32
      const b = r / Math.SQRT2
      const c = r * (1 - 1 / Math.SQRT2)
      const pts = [
        [0,-r],[c,-b],[b,-b],[b,-c],
        [r,0],[b,c],[b,b],[c,b],
        [0,r],[-c,b],[-b,b],[-b,c],
        [-r,0],[-b,-c],[-b,-b],[-c,-b]
      ].map(([px,py]) => `${cx+px},${cy+py}`).join(' ')
      parts.push(`<polygon points="${pts}" fill="none" stroke="${theme.titleText}" stroke-width="2.5"/>`)
      parts.push(`<text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="10" font-weight="bold" font-family="serif" fill="${theme.titleText}">THE</text>`)
      parts.push(`<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="12" font-weight="bold" font-family="serif" fill="${theme.titleText}">LANDLORD'S GAME</text>`)
      parts.push(`<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="8" font-family="serif" fill="${theme.titleText}">AND PROSPERITY</text>`)
      parts.push(`<text x="${cx}" y="${cy + 36}" text-anchor="middle" font-size="5.5" font-family="serif" fill="${theme.text}">A Magie Game — Patent No. 1,509,312</text>`)
      parts.push(`<text x="${cx}" y="${cy + 46}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">Adgame Company (Inc.), Washington, D.C.</text>`)

      const labelOff = 14
      parts.push(`<text x="${cx}" y="${innerY + labelOff}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#c8b020">Your Checker Yellow</text>`)
      parts.push(`<text x="${cx}" y="${innerY + innerH - labelOff + 4}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#2a5a9a">Your Checker Blue</text>`)
      parts.push(`<text x="${innerX + labelOff}" y="${cy}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#3a8a3a" transform="rotate(-90,${innerX + labelOff},${cy})">Your Checker Green</text>`)
      parts.push(`<text x="${innerX + innerW - labelOff}" y="${cy}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#8c2020" transform="rotate(90,${innerX + innerW - labelOff},${cy})">Your Checker Red</text>`)

      const starEdge = r / Math.SQRT2
      const checkerZone = labelOff + 6
      const leftEdge = innerX + checkerZone
      const rightEdge = innerX + innerW - checkerZone
      const starLeft = cx - starEdge
      const starRight = cx + starEdge
      const starTop = cy - starEdge
      const starBot = cy + starEdge

      const leftMid = (leftEdge + starLeft) / 2
      const rightMid = (rightEdge + starRight) / 2

      parts.push(`<text x="${leftMid}" y="${cy}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" transform="rotate(-90,${leftMid},${cy})">General Land Office</text>`)
      parts.push(`<text x="${rightMid}" y="${cy}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" transform="rotate(90,${rightMid},${cy})">Public Treasury</text>`)

      const boxW = innerW * 0.14
      const boxH = innerH * 0.08
      const textHalfLen = 32
      const arrowGap = 4

      const leftBoxTopY = (innerY + starTop) / 2
      const leftBoxBotY = (innerY + innerH + starBot) / 2
      const leftArrowTopStart = cy - textHalfLen - arrowGap
      const leftArrowBotStart = cy + textHalfLen + arrowGap

      parts.push(`<line x1="${leftMid}" y1="${leftArrowTopStart}" x2="${leftMid}" y2="${leftBoxTopY + boxH/2 + 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${leftMid - 2},${leftBoxTopY + boxH/2 + 5} L ${leftMid},${leftBoxTopY + boxH/2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH/2 + 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${leftMid - boxW/2}" y="${leftBoxTopY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-1" data-type="land-in-use"/>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxTopY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">For Sale</text>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxTopY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Land in Use</text>`)

      parts.push(`<line x1="${leftMid}" y1="${leftArrowBotStart}" x2="${leftMid}" y2="${leftBoxBotY - boxH/2 - 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${leftMid - 2},${leftBoxBotY - boxH/2 - 5} L ${leftMid},${leftBoxBotY - boxH/2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH/2 - 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${leftMid - boxW/2}" y="${leftBoxBotY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-2" data-type="idle-land"/>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxBotY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">For Sale</text>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxBotY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Idle Land</text>`)

      const rightBoxTopY = leftBoxTopY
      const rightBoxBotY = leftBoxBotY
      const rightArrowTopStart = cy - textHalfLen - arrowGap
      const rightArrowBotStart = cy + textHalfLen + arrowGap

      parts.push(`<line x1="${rightMid}" y1="${rightArrowTopStart}" x2="${rightMid}" y2="${rightBoxTopY + boxH/2 + 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${rightMid - 2},${rightBoxTopY + boxH/2 + 5} L ${rightMid},${rightBoxTopY + boxH/2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH/2 + 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${rightMid - boxW/2}" y="${rightBoxTopY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-3" data-type="general-fund"/>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxTopY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">General Fund</text>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxTopY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}"></text>`)

      parts.push(`<line x1="${rightMid}" y1="${rightArrowBotStart}" x2="${rightMid}" y2="${rightBoxBotY - boxH/2 - 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${rightMid - 2},${rightBoxBotY - boxH/2 - 5} L ${rightMid},${rightBoxBotY - boxH/2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH/2 - 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${rightMid - boxW/2}" y="${rightBoxBotY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-4" data-type="rent-fund"/>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxBotY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Prosperity Land</text>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxBotY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Rent Fund</text>`)
    } else if (variant === '1906-egc') {
      parts.push(`<text x="${cx}" y="${cy - 20}" text-anchor="middle" font-size="7" font-weight="bold" font-family="serif" fill="${theme.text}">MISCELLANEOUS</text>`)
      parts.push(`<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">PUBLIC TREASURY</text>`)
      parts.push(`<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">MONEY DENOMINATIONS</text>`)

      const coinY = cy + 34
      const coins = ['$1', '$5', '$10', '$50', '$100']
      const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
      const coinR = 7
      const coinGap = 20
      const coinStartX = cx - (coins.length - 1) * coinGap / 2
      for (let i = 0; i < coins.length; i++) {
        const coinX = coinStartX + i * coinGap
        const textColor = i === 0 ? theme.text : '#fff'
        parts.push(`<circle cx="${coinX}" cy="${coinY}" r="${coinR}" fill="${coinColors[i]}" stroke="${theme.spaceStroke}" stroke-width="0.75"/>`)
        parts.push(`<text x="${coinX}" y="${coinY + 2}" text-anchor="middle" font-size="4" font-weight="bold" font-family="serif" fill="${textColor}">${coins[i]}</text>`)
      }

      parts.push(`<text x="${cx}" y="${cy + 58}" text-anchor="middle" font-size="6" font-weight="bold" font-family="serif" fill="${theme.text}">The Landlord's Game</text>`)
      parts.push(`<text x="${cx}" y="${cy + 69}" text-anchor="middle" font-size="4.5" font-family="serif" fill="${theme.text}">Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie</text>`)
      parts.push(`<text x="${cx}" y="${cy + 79}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">Economic Game Co., New York</text>`)

      if (board.naturalOpportunities) {
        const natOps = board.naturalOpportunities
        const cellW = innerW / 9
        const cellH = innerH / 9
        const armLen = cellW * 2
        const armLenV = cellH * 2
        const thick = cellW
        const thickV = cellH
        const fill = '#d4c060'
        const stroke = '#3a3020'

        const lShapes = [
          { corner: 'br',
            pts: `${innerX + innerW - armLen},${innerY + innerH} ${innerX + innerW - armLen},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH}`,
            tx: innerX + innerW - armLen / 2, ty: innerY + innerH - thickV / 2,
            tx2: innerX + innerW - thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
          { corner: 'bl',
            pts: `${innerX},${innerY + innerH} ${innerX},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH}`,
            tx: innerX + armLen / 2, ty: innerY + innerH - thickV / 2,
            tx2: innerX + thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
          { corner: 'tl',
            pts: `${innerX},${innerY} ${innerX + armLen},${innerY} ${innerX + armLen},${innerY + thickV} ${innerX + thick},${innerY + thickV} ${innerX + thick},${innerY + armLenV} ${innerX},${innerY + armLenV}`,
            tx: innerX + armLen / 2, ty: innerY + thickV / 2,
            tx2: innerX + thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
          { corner: 'tr',
            pts: `${innerX + innerW - armLen},${innerY} ${innerX + innerW},${innerY} ${innerX + innerW},${innerY + armLenV} ${innerX + innerW - thick},${innerY + armLenV} ${innerX + innerW - thick},${innerY + thickV} ${innerX + innerW - armLen},${innerY + thickV}`,
            tx: innerX + innerW - armLen / 2, ty: innerY + thickV / 2,
            tx2: innerX + innerW - thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
        ]

        for (let i = 0; i < natOps.length; i++) {
          const no = natOps[i]
          const L = lShapes[i]
          parts.push(`<polygon points="${L.pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" class="board-cell" data-sq="inner-${i + 1}" data-type="natural-opportunity"/>`)
          parts.push(`<text x="${L.tx}" y="${L.ty - 4}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Natural Opportunity</text>`)
          parts.push(`<text x="${L.tx}" y="${L.ty + 3}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">to Labor</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 - 5}" text-anchor="middle" font-size="3.5" font-weight="bold" font-family="serif" fill="${theme.text}">${esc(no.name)}</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 + 3}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Wages $${no.wages}</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 + 10}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Rent $${no.rent}</text>`)
        }

        const cellFill = theme.lot
        const patchW = 1.5
        // TIMBERLAND (BR) → WAYBACK pos 1, bottom side idx 0 (rightmost on bottom)
        const br_cx = innerX + innerW - cellW / 2
        parts.push(`<rect x="${br_cx - cellW / 2}" y="${innerY + innerH - patchW}" width="${cellW}" height="${patchW}" fill="${fill}"/>`)
        parts.push(`<rect x="${br_cx - cellW / 2}" y="${innerY + innerH}" width="${cellW}" height="${patchW}" fill="${cellFill}"/>`)
        // FARMLANDS (BL) → BOOMTOWN pos 11, left side idx 0 (lowest on left)
        const bl_cy = innerY + innerH - cellH / 2
        parts.push(`<rect x="${innerX - patchW}" y="${bl_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${cellFill}"/>`)
        parts.push(`<rect x="${innerX}" y="${bl_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${fill}"/>`)
        // COAL MINES (TL) → EASY STREET pos 21, top side idx 0 (leftmost on top)
        const tl_cx = innerX + cellW / 2
        parts.push(`<rect x="${tl_cx - cellW / 2}" y="${innerY}" width="${cellW}" height="${patchW}" fill="${fill}"/>`)
        parts.push(`<rect x="${tl_cx - cellW / 2}" y="${innerY - patchW}" width="${cellW}" height="${patchW}" fill="${cellFill}"/>`)
        // OIL FIELDS (TR) → BROADWAY pos 31, right side idx 0 (topmost on right)
        const tr_cy = innerY + cellH / 2
        parts.push(`<rect x="${innerX + innerW - patchW}" y="${tr_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${fill}"/>`)
        parts.push(`<rect x="${innerX + innerW}" y="${tr_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${cellFill}"/>`)
      }
    } else {
      const pad = 14
      const gap = 8
      const qw = (innerW - pad * 2 - gap) / 2
      const qh = (innerH - pad * 2 - gap) / 2
      const x0 = innerX + pad, x1 = innerX + pad + qw + gap
      const y0 = innerY + pad, y1 = innerY + pad + qh + gap
      const sw = 1.5

      const quads = [
        { x: x0, y: y0, label: 'R.R.', sub: '$5', sq: 'inner-1' },
        { x: x1, y: y0, label: 'WAGES', sub: null, sq: 'inner-2' },
        { x: x0, y: y1, label: 'BANK', sub: null, sq: 'inner-3' },
        { x: x1, y: y1, label: 'PUBLIC TREASURY', sub: null, sq: 'inner-4' },
      ]

      for (const q of quads) {
        parts.push(`<rect x="${q.x}" y="${q.y}" width="${qw}" height="${qh}" fill="${theme.innerBg}" stroke="${theme.spaceStroke}" stroke-width="${sw}" class="board-cell" data-sq="${q.sq}" data-type="${q.label.toLowerCase()}"/>`)
        const qcx = q.x + qw / 2, qcy = q.y + qh / 2
        if (q.label === 'PUBLIC TREASURY') {
          parts.push(`<text x="${qcx}" y="${qcy - 4}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">PUBLIC</text>`)
          parts.push(`<text x="${qcx}" y="${qcy + 10}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">TREASURY</text>`)
        } else {
          parts.push(`<text x="${qcx}" y="${qcy + (q.sub ? -2 : 4)}" text-anchor="middle" font-size="11" font-weight="bold" font-family="serif" fill="${theme.titleText}">${q.label}</text>`)
          if (q.sub) parts.push(`<text x="${qcx}" y="${qcy + 10}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">${q.sub}</text>`)
        }
      }

      parts.push(`<text x="${cx}" y="${innerY + innerH - 3}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">L.J. Magie, Patent No. 748,626</text>`)
    }

    return parts.join('')
  },
  _wrapText(text, maxChars) {
    if (text.length <= maxChars) return [text]
    const words = text.split(' ')
    const lines = []
    let current = ''
    for (const word of words) {
      if (current.length + word.length + 1 > maxChars && current.length > 0) {
        lines.push(current)
        current = word
      } else {
        current = current ? current + ' ' + word : word
      }
    }
    if (current) lines.push(current)
    return lines
  },
}

// ─── PROVIDER REGISTRY ──────────────────────────────────────────────────────

const PROVIDERS = { checkered, 'mono-grid': monoGrid, go, surakarta, xiangqi, shogi, nyout, morris, asalto, alquerque, hex, mancala, backgammon, 'stern-halma': sternHalma, landlords }

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
  const overflow = (opts.variant === '1904-patent' && boardStyle === 'landlords') ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${overflow}>`)
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

    // Build lookup key: for typed pieces (stone/man/king/piece) use color prefix
    const colorPrefix = piece.color === 'white' ? 'w' : 'b'
    const imageKey = (piece.type === 'stone') ? colorPrefix + 'S'
      : (piece.type === 'man') ? colorPrefix + 'M'
      : (piece.type === 'king') ? colorPrefix + 'K'
      : (piece.type === 'piece') ? colorPrefix + 'P'
      : piece.type

    if (pieceImages[imageKey]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      const surfaceMap = opts.pieceSurfaceMap || {}
      const hasSurface = opts.pieceBorders || surfaceMap[imageKey]
      if (hasSurface) {
        const isUpper = piece.type === piece.type.toUpperCase()
        const owner = isUpper ? 'white' : 'black'
        const surface = opts.pieceSurface && opts.pieceSurface.owners && opts.pieceSurface.owners[owner]
        const ownerColors = surface || { fill: opts.pieceBorders && opts.pieceBorders[owner] || '#888', stroke: 'rgba(0,0,0,0.3)' }
        parts.push(renderSurfaceSVG('disc', pos.x, pos.y, tileSize, ownerColors, pieceImages[imageKey]))
      } else {
        parts.push(`<image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
      }
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
