/**
 * Grid SVG providers — produce SVG string fragments for grid-based boards.
 *
 * Each provider has:
 *   name         — identifier string
 *   positionType — 'square' | 'intersection'
 *   labelStyle   — 'algebraic' | 'go' | 'none'
 *   defaultColors — fallback colour palette
 *   computeLayout(opts) → { boardW, boardH }
 *   render(ctx)  → SVG string fragment
 *   getIntersection(r, c, ctx) → { x, y }  (optional, for intersection-mode)
 *
 * Moved verbatim from js/board-diagrams.js — these are the canonical renderers
 * that produce the published rulebook SVGs.
 */

export const checkered = {
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

export const monoGrid = {
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

export const go = {
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

export const surakarta = {
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

function clusterZoneCells(cells) {
  if (!cells.length) return []
  const key = (r, c) => `${r},${c}`
  const set = new Set(cells.map(([r, c]) => key(r, c)))
  const visited = new Set()
  const clusters = []
  for (const [r, c] of cells) {
    const k = key(r, c)
    if (visited.has(k)) continue
    const cluster = []
    const queue = [[r, c]]
    while (queue.length) {
      const [cr, cc] = queue.pop()
      const ck = key(cr, cc)
      if (visited.has(ck) || !set.has(ck)) continue
      visited.add(ck)
      cluster.push([cr, cc])
      queue.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1])
    }
    if (cluster.length) clusters.push(cluster)
  }
  return clusters
}

export const xiangqi = {
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
    if (opts.zones) {
      for (const [, zone] of Object.entries(opts.zones)) {
        if (!zone || !zone.cells || !zone.cells.length) continue
        const fill = zone.fill || '#6b9fd4'
        const opacity = zone.opacity || 0.4
        const clusters = clusterZoneCells(zone.cells)
        for (const cluster of clusters) {
          const cRows = cluster.map(c => c[0])
          const cCols = cluster.map(c => c[1])
          const minR = Math.min(...cRows), maxR = Math.max(...cRows)
          const minC = Math.min(...cCols), maxC = Math.max(...cCols)
          const zx = gx + minC * tileSize
          const zy = gy + minR * tileSize
          const zw = Math.max((maxC - minC) * tileSize, tileSize)
          const zh = Math.max((maxR - minR) * tileSize, tileSize)
          parts.push(`<rect x="${zx}" y="${zy}" width="${zw}" height="${zh}" fill="${fill}" opacity="${opacity}"/>`)
        }
      }
    }
    parts.push(`<rect x="${ox}" y="${oy}" width="${gridW + inset * 2}" height="${gridH + inset * 2}" fill="none" stroke="${colors.gridLine}" stroke-width="2"/>`)
    parts.push(`<g stroke="${colors.gridLine}" stroke-width="1">`)
    if (river) {
      const riverTop = opts.riverRows ? opts.riverRows[0] : Math.floor(rows / 2) - 1
      const riverBot = opts.riverRows ? opts.riverRows[1] : Math.floor(rows / 2)
      for (let r = 0; r < rows; r++) {
        if (r === riverTop || r === riverBot) continue
        const y = gy + r * tileSize
        parts.push(`<line x1="${gx}" y1="${y}" x2="${gx + gridW}" y2="${y}"/>`)
      }
      const ry1 = gy + riverTop * tileSize, ry2 = gy + riverBot * tileSize
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
    if (opts.palace !== false) {
      const mid = Math.floor(cols / 2)
      const palaceLeft = opts.palaceCols ? opts.palaceCols[0] : mid - 1
      const palaceRight = opts.palaceCols ? opts.palaceCols[1] : mid + 1
      const palaceRows = opts.palaceRows || 2
      const palaceTopRow = 0
      const palaceBotRow = rows - 1 - palaceRows
      const pl = gx + palaceLeft * tileSize, pr = gx + palaceRight * tileSize
      parts.push(`<g stroke="${colors.palace}" stroke-width="0.8" stroke-dasharray="4,3">`)
      parts.push(`<line x1="${pl}" y1="${gy + palaceTopRow * tileSize}" x2="${pr}" y2="${gy + (palaceTopRow + palaceRows) * tileSize}"/>`)
      parts.push(`<line x1="${pr}" y1="${gy + palaceTopRow * tileSize}" x2="${pl}" y2="${gy + (palaceTopRow + palaceRows) * tileSize}"/>`)
      parts.push(`<line x1="${pl}" y1="${gy + palaceBotRow * tileSize}" x2="${pr}" y2="${gy + (palaceBotRow + palaceRows) * tileSize}"/>`)
      parts.push(`<line x1="${pr}" y1="${gy + palaceBotRow * tileSize}" x2="${pl}" y2="${gy + (palaceBotRow + palaceRows) * tileSize}"/>`)
      parts.push('</g>')
    }
    if (river) {
      const rtop = opts.riverRows ? opts.riverRows[0] : Math.floor(rows / 2) - 1
      const rbot = opts.riverRows ? opts.riverRows[1] : Math.floor(rows / 2)
      const rty1 = gy + rtop * tileSize, rty2 = gy + rbot * tileSize
      const rmid = (rty1 + rty2) / 2
      const riverFontSize = Math.min(tileSize * 0.45, 14)
      parts.push(`<text x="${gx + gridW * 0.25}" y="${rmid + riverFontSize * 0.35}" text-anchor="middle" font-size="${riverFontSize}" font-family="serif" pointer-events="none" fill="${colors.riverText}">楚 河</text>`)
      parts.push(`<text x="${gx + gridW * 0.75}" y="${rmid + riverFontSize * 0.35}" text-anchor="middle" font-size="${riverFontSize}" font-family="serif" pointer-events="none" fill="${colors.riverText}">漢 界</text>`)
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

export const shogi = {
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

export const alquerque = {
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
