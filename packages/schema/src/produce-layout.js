/**
 * Produce layout config from resolved frontmatter.
 *
 * Takes engine.topology + engine.surface (resolved) + engine.render and outputs
 * the imperative config object that topology renderLayout() consumes directly.
 *
 * This module routes on topology.type — that's the universal structural vocabulary,
 * not game knowledge. No game names, no hardcoded positions, no cultural text.
 */

import { resolveSurface } from './surfaces.js'

export function produceLayout(engine) {
  if (!engine || !engine.topology) return null

  const surface = resolveSurface(engine.surface)
  const colors = surface.colors || {}
  const render = engine.render || {}
  const topo = engine.topology

  switch (topo.type) {
    case 'grid': return produceGridLayout(topo, colors, render)
    case 'hex': return produceHexLayout(topo, colors, render)
    case 'track': return produceTrackLayout(topo, colors, render)
    case 'pit': return producePitLayout(topo, colors, render)
    case 'graph': return produceGraphLayout(topo, colors, render)
    default: return null
  }
}

function produceGridLayout(topo, colors, render) {
  const rows = topo.rows || 8
  const cols = topo.cols || 8
  const cellSize = render.cellSize || 40
  const isIntersection = topo.layout === 'intersections' || topo.layout === 'cross'
  const positionType = isIntersection ? 'intersection' : 'square'
  const showLabels = render.labels !== false

  if (render.ops) {
    return produceFromOpsDeclaration(rows, cols, cellSize, positionType, showLabels, colors, render)
  }

  const inset = isIntersection ? Math.round(cellSize * 0.5) : 0
  const cellFill = buildCellFill(render.cellColor, colors)
  const backgrounds = isIntersection
    ? [{ fill: colors['cell-light'] || '#d9b483', rx: 4 }]
    : []
  const needsLines = isIntersection || render.cellColor === 'uniform'
  const lines = needsLines
    ? { color: colors.stroke || '#333', width: isIntersection ? 2 : 1 }
    : { horizontal: false }

  const layout = {
    tileSize: cellSize,
    positionType,
    showLabels,
    inset,
    backgrounds,
    zones: produceZones(render.zones, colors),
    cellFill,
    cellDecorations: produceDecorations(render.decorations, colors, rows, cols, cellSize),
    cellAttrs: null,
    lines,
    diagonals: produceDiagonals(render.decorations, colors),
    paths: producePaths(render.decorations, topo, cellSize),
    markers: produceMarkers(render.decorations, topo),
    texts: [],
    labels: showLabels ? { color: colors.stroke || '#555', fontSize: 10 } : {},
  }

  return { type: 'grid', rows, cols, config: layout }
}

function produceFromOpsDeclaration(rows, cols, cellSize, positionType, showLabels, colors, render) {
  const isIntersection = positionType === 'intersection'
  const inset = render.insetFactor != null ? cellSize * render.insetFactor : (render.inset != null ? render.inset : (isIntersection ? Math.round(cellSize * 0.5) : 0))
  const gridW = isIntersection ? (cols - 1) * cellSize : cols * cellSize
  const gridH = isIntersection ? (rows - 1) * cellSize : rows * cellSize
  const pad = showLabels ? 24 : 0
  const ox = pad, oy = pad
  const gx = ox + (isIntersection ? inset : 0)
  const gy = oy + (isIntersection ? inset : 0)

  const boardW = gridW + (isIntersection ? inset * 2 : 0)
  const boardH = gridH + (isIntersection ? inset * 2 : 0)
  const idStyle = render.idStyle || 'algebraic'

  const ops = render.ops.flatMap(decl => {
    const result = translateOp(decl, { rows, cols, cellSize, colors, inset, gridW, gridH, boardW, boardH, ox, oy, gx, gy, idStyle, cellMap: render.cellMap })
    if (result._prefixRect) {
      const prefix = result._prefixRect
      delete result._prefixRect
      return [prefix, result]
    }
    return [result]
  })

  const goStyle = idStyle === 'go'
  const GO_ALPHABET = 'ABCDEFGHJKLMNOPQRST'
  const fs = Math.min(13, pad * 0.55)

  const config = {
    tileSize: cellSize,
    positionType,
    inset,
    origin: { x: ox, y: oy },
    size: { width: boardW + pad * 2, height: boardH + pad * 2 },
    ops,
    labels: showLabels ? {
      show: true,
      color: goStyle ? (colors.labelText || '#5a4020') : (colors.labelText || colors.stroke || '#5c3a1e'),
      fontSize: fs,
      fontFamily: goStyle ? 'sans-serif' : 'monospace',
      alphabet: goStyle ? GO_ALPHABET.slice(0, cols) : null,
      offsetBaseline: true,
    } : null,
  }

  return { type: 'grid', rows, cols, config }
}

function buildCrossMapOps(rows, cols, castles) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  const midR = Math.floor(rows / 2)
  const midC = Math.floor(cols / 2)
  const armWidth = 3
  const half = Math.floor(armWidth / 2)
  for (let r = 0; r < midR - half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let r = midR + half + 1; r < rows; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let c = 0; c < midC - half; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let c = midC + half + 1; c < cols; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let r = midR - half; r <= midR + half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'home'
  for (const [r, c] of castles) if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'castle'
  return grid
}

function buildOpsCellMap(zones, rows, cols, defaultFill) {
  const map = Array.from({ length: rows }, () => Array(cols).fill(defaultFill))
  if (!zones) return map
  if (zones.voids) {
    for (const [r, c] of zones.voids) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = null
    }
  }
  if (zones.cells) {
    for (const def of zones.cells) {
      const positions = Array.isArray(def.at[0]) ? def.at : [def.at]
      for (const [r, c] of positions) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = def.type
      }
    }
  }
  return map
}

const AUTO_STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,9],[6,6],[9,3],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
}

function translateOp(decl, ctx) {
  const { rows, cols, cellSize, colors, inset, gridW, gridH, boardW, boardH, ox, oy, gx, gy, idStyle } = ctx

  switch (decl.op) {
    case 'rect': {
      const fill = decl.fill === 'none' ? 'none' : (colors[decl.fill] || decl.fill)
      const attrs = {}
      if (decl.scope === 'board') {
        Object.assign(attrs, { x: ox, y: oy, width: boardW, height: boardH })
        attrs.fill = fill
        if (decl.rx != null) attrs.rx = decl.rx
      } else if (decl.scope === 'grid') {
        const offY = (decl.rowOffset || 0) * cellSize
        const h = decl.rowSpan ? decl.rowSpan * cellSize : gridH
        Object.assign(attrs, { x: gx, y: gy + offY, width: gridW, height: h })
        attrs.fill = fill
        if (decl.rx != null) attrs.rx = decl.rx
      } else {
        // Resolve relative positioning: x/y offset from ox/oy, negative width/height from boardW/boardH
        const rx = decl.x != null ? ox + decl.x : ox
        const ry = decl.y != null ? oy + decl.y : oy
        const rw = decl.width != null ? (decl.width < 0 ? boardW + decl.width : decl.width) : boardW
        const rh = decl.height != null ? (decl.height < 0 ? boardH + decl.height : decl.height) : boardH
        Object.assign(attrs, { x: rx, y: ry, width: rw, height: rh })
        if (decl.rx != null) attrs.rx = decl.rx
        attrs.fill = fill
      }
      if (decl.stroke) attrs.stroke = colors[decl.stroke] || decl.stroke
      if (decl['stroke-width'] != null) attrs['stroke-width'] = decl['stroke-width']
      return { op: 'rect', attrs }
    }
    case 'grid-lines':
      return {
        op: 'grid-lines',
        grouped: decl.grouped || false,
        order: decl.order || 'hv',
        color: colors[decl.color] || decl.color,
        width: decl.width,
        ...(decl.skipRows ? { skipRows: decl.skipRows } : {}),
        ...(decl.appendRows ? { appendRows: decl.appendRows } : {}),
        ...(decl.split ? { split: decl.split } : {}),
      }
    case 'markers': {
      let items = decl.at
      if (items === 'auto-star-points') items = AUTO_STAR_POINTS[rows] || []
      const fill = colors[decl.fill] || decl.fill
      const result = { op: 'markers', radius: decl.radius }
      if (decl.grouped) { result.grouped = true; result.groupFill = fill }
      else if (fill) { result.itemFill = fill }
      if (decl.allCells) result.allCells = true
      else result.items = items || []
      if (decl.hits) {
        const hitRadius = decl.hits.radiusFactor ? cellSize * decl.hits.radiusFactor : decl.hits.radius
        result.hits = { radius: hitRadius, idStyle: decl.hits.idStyle || idStyle }
      }
      return result
    }
    case 'hit-targets': {
      const result = { op: 'hit-targets', grouped: decl.grouped || false, radius: decl.radiusFactor ? cellSize * decl.radiusFactor : (decl.radius || cellSize * 0.4), idStyle }
      if (decl.shape) result.shape = decl.shape
      return result
    }
    case 'diagonals':
      return {
        op: 'diagonals',
        predicate: decl.pattern === 'alternating' ? (r, c) => (r + c) % 2 === 0 : decl.predicate,
        color: colors[decl.color] || decl.color,
        width: decl.width,
      }
    case 'texts': {
      if (decl.river) {
        const rt = decl.river.rows[0], rb = decl.river.rows[1]
        const rty1 = gy + rt * cellSize, rty2 = gy + rb * cellSize
        const rmid = (rty1 + rty2) / 2
        const fs = Math.min(cellSize * 0.45, 14)
        const fill = colors[decl.river.fill] || decl.river.fill || colors.stroke
        return { op: 'texts', items: decl.river.texts.map((text, i) => ({
          attrs: { x: gx + gridW * (i === 0 ? 0.25 : 0.75), y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill },
          text,
        })) }
      }
      return { op: 'texts', items: (decl.items || []).map(t => ({ attrs: { ...t.attrs, fill: colors[t.attrs?.fill] || t.attrs?.fill }, text: t.text })) }
    }
    case 'group': {
      let children = decl.children
      if (decl.palace) {
        const pl = gx + decl.palace.cols[0] * cellSize
        const pr = gx + decl.palace.cols[1] * cellSize
        const palaceRows = decl.palace.rows || 2
        children = [
          { tag: 'line', attrs: { x1: pl, y1: gy, x2: pr, y2: gy + palaceRows * cellSize } },
          { tag: 'line', attrs: { x1: pr, y1: gy, x2: pl, y2: gy + palaceRows * cellSize } },
          { tag: 'line', attrs: { x1: pl, y1: gy + (rows - 1 - palaceRows) * cellSize, x2: pr, y2: gy + (rows - 1) * cellSize } },
          { tag: 'line', attrs: { x1: pr, y1: gy + (rows - 1 - palaceRows) * cellSize, x2: pl, y2: gy + (rows - 1) * cellSize } },
        ]
      }
      if (children === 'arcs') {
        children = surakartaArcElements(gx, gy, cellSize, rows, cols, colors)
      }
      const attrs = { ...(decl.attrs || {}) }
      if (decl.fill) attrs.fill = colors[decl.fill] || decl.fill
      if (decl.stroke) attrs.stroke = colors[decl.stroke] || decl.stroke
      if (decl['stroke-width'] != null) attrs['stroke-width'] = decl['stroke-width']
      if (decl['stroke-dasharray']) attrs['stroke-dasharray'] = decl['stroke-dasharray']
      if (decl['stroke-linecap']) attrs['stroke-linecap'] = decl['stroke-linecap']
      return { op: 'group', attrs, children }
    }
    case 'cells': {
      if (decl.pattern === 'checkered') {
        const light = colors[decl.light] || decl.light
        const dark = colors[decl.dark] || decl.dark
        const { cellMap } = ctx
        if (cellMap) {
          const voidFill = colors.voidFill || 'transparent'
          return {
            op: 'cells',
            interactive: true,
            _prefixRect: { op: 'rect', attrs: { x: ox, y: oy, width: cols * cellSize, height: rows * cellSize, fill: voidFill } },
            fill(r, c) {
              const cell = cellMap[r] && cellMap[r][c]
              if (!cell) return null
              const fill = (typeof cell === 'string' && colors[cell]) ? colors[cell] : (r + c) % 2 === 0 ? light : dark
              const stroke = (typeof cell === 'string' && colors[cell + 'Stroke']) ? colors[cell + 'Stroke'] : null
              return { fill, stroke: stroke || 'rgba(0,0,0,0.15)', strokeWidth: stroke ? 2 : 1, type: cell }
            },
            decorations(r, c, cx, cy, ts) {
              const cell = cellMap[r] && cellMap[r][c]
              if (cell === 'rosette') {
                const s = ts * 0.25
                return [
                  { tag: 'circle', attrs: { cx, cy, r: s * 0.42, fill: '#8b3a3a' } },
                  { tag: 'circle', attrs: { cx, cy: cy - s, r: s * 0.25, fill: '#8b3a3a' } },
                  { tag: 'circle', attrs: { cx, cy: cy + s, r: s * 0.25, fill: '#8b3a3a' } },
                  { tag: 'circle', attrs: { cx: cx - s, cy, r: s * 0.25, fill: '#8b3a3a' } },
                  { tag: 'circle', attrs: { cx: cx + s, cy, r: s * 0.25, fill: '#8b3a3a' } },
                  { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
                  { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
                  { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
                  { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
                ]
              }
              if (cell === 'castle') {
                const d = ts * 0.3
                const xStroke = colors.castleX || '#fff8f0'
                return [
                  { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
                  { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
                ]
              }
              return null
            },
          }
        }
        return { op: 'cells', interactive: decl.interactive !== false, fill: (r, c) => (r + c) % 2 === 0 ? light : dark }
      }
      if (decl.pattern === 'uniform') {
        const fill = colors[decl.fill] || decl.fill
        return { op: 'cells', interactive: decl.interactive !== false, fill: () => fill }
      }
      if (decl.pattern === 'cross') {
        const light = colors[decl.light] || decl.light
        const dark = colors[decl.dark] || decl.dark
        const map = buildCrossMapOps(rows, cols, decl.castles || [])
        const typeColors = {}
        const typeStrokes = {}
        if (decl.typeColors) for (const [t, v] of Object.entries(decl.typeColors)) typeColors[t] = colors[v] || v
        if (decl.typeStrokes) for (const [t, v] of Object.entries(decl.typeStrokes)) typeStrokes[t] = colors[v] || v
        const decorationDefs = decl.decorations || {}
        const result = { op: 'cells', interactive: true }
        result.fill = (r, c) => {
          const cell = map[r] && map[r][c]
          if (!cell) return null
          const fill = typeColors[cell] || ((r + c) % 2 === 0 ? light : dark)
          const stroke = typeStrokes[cell] || null
          return { fill, stroke: stroke || 'rgba(0,0,0,0.15)', strokeWidth: stroke ? 2 : 1, type: cell }
        }
        if (Object.keys(decorationDefs).length > 0) {
          result.decorations = (r, c, cx, cy, ts) => {
            const cell = map[r] && map[r][c]
            if (!cell || !decorationDefs[cell]) return null
            const def = decorationDefs[cell]
            if (def === 'castle-x') {
              const d = ts * 0.3
              const xStroke = colors[decl.castleXColor] || decl.castleXColor || '#fff8f0'
              return [
                { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
                { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
              ]
            }
            return null
          }
        }
        return result
      }
      if (decl.pattern === 'cellMap') {
        const light = colors[decl.light] || decl.light
        const dark = colors[decl.dark] || decl.dark
        const voidFill = colors[decl.voidFill] || decl.voidFill || 'transparent'
        const map = buildOpsCellMap(decl.zones, rows, cols, decl.defaultFill || 'floor')
        const typeColors = {}
        const typeStrokes = {}
        if (decl.typeColors) {
          for (const [type, val] of Object.entries(decl.typeColors)) {
            typeColors[type] = colors[val] || val
          }
        }
        if (decl.typeStrokes) {
          for (const [type, val] of Object.entries(decl.typeStrokes)) {
            typeStrokes[type] = colors[val] || val
          }
        }
        const decorationDefs = decl.decorations || {}
        const result = { op: 'cells', interactive: true }
        result.fill = (r, c) => {
          const cell = map[r] && map[r][c]
          if (!cell) return null
          const fill = typeColors[cell] || ((r + c) % 2 === 0 ? light : dark)
          const stroke = typeStrokes[cell] || null
          return { fill, stroke: stroke || 'rgba(0,0,0,0.15)', strokeWidth: stroke ? 2 : 1, type: cell }
        }
        if (Object.keys(decorationDefs).length > 0) {
          result.decorations = (r, c, cx, cy, ts) => {
            const cell = map[r] && map[r][c]
            if (!cell || !decorationDefs[cell]) return null
            const def = decorationDefs[cell]
            if (def === 'castle-x') {
              const d = ts * 0.3
              const xStroke = colors[decl.castleXColor] || decl.castleXColor || '#fff8f0'
              return [
                { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
                { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
              ]
            }
            if (def === 'rosette') {
              const s = ts * 0.25
              return [
                { tag: 'circle', attrs: { cx, cy, r: s * 0.42, fill: '#8b3a3a' } },
                { tag: 'circle', attrs: { cx, cy: cy - s, r: s * 0.25, fill: '#8b3a3a' } },
                { tag: 'circle', attrs: { cx, cy: cy + s, r: s * 0.25, fill: '#8b3a3a' } },
                { tag: 'circle', attrs: { cx: cx - s, cy, r: s * 0.25, fill: '#8b3a3a' } },
                { tag: 'circle', attrs: { cx: cx + s, cy, r: s * 0.25, fill: '#8b3a3a' } },
                { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
                { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
                { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
                { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
              ]
            }
            return null
          }
        }
        return result
      }
      return decl
    }
    default:
      return decl
  }
}

function surakartaArcElements(gx, gy, tileSize, rows, cols, colors) {
  const innerR = tileSize
  const outerR = tileSize * 2
  const ix = (i) => gx + i * tileSize
  const iy = (i) => gy + i * tileSize
  return [
    { tag: 'path', attrs: { d: `M ${ix(1)},${iy(0)} A ${innerR},${innerR} 0 1,0 ${ix(0)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 2)},${iy(0)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 1)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(0)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,0 ${ix(1)},${iy(rows - 1)}`, stroke: colors.innerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 1)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 2)},${iy(rows - 1)}`, stroke: colors.innerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(2)},${iy(0)} A ${outerR},${outerR} 0 1,0 ${ix(0)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 3)},${iy(0)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 1)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(0)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,0 ${ix(2)},${iy(rows - 1)}`, stroke: colors.outerArc || '#6b4a30' } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 1)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 3)},${iy(rows - 1)}`, stroke: colors.outerArc || '#6b4a30' } },
  ]
}


function produceHexLayout(topo, colors, render) {
  if (render._hexes || render._hexRadius != null || (render._hexRows && render._hexCols)) return hexBoardOps(colors, render)
  return produceHexLegacy(topo, colors, render)
}

// --- Hex board ops builder (studio path) ---
//
// Verbatim geometry from the historical hex provider — byte-identity
// contract. Colour strategy functions, frames, centre markers, and piece
// positions arrive as resolved parameters. Runtime pass-through fields:
// render._hexes | _hexRadius | _hexRows/_hexCols (cell set),
// render._colorFn, _hexTypes, _frame, _flat, _centreMarker,
// render._position ("q,r" → piece), _pieceImages.

const HEX_EDGE_NEIGHBOURS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]

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

function hexGridCells(radius) {
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

function hexRhombusCells(rows, cols) {
  const hexes = []
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

function hexBorderEdges(hexes, size, flat, oX, oY, scale) {
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

function hexBoardOps(colors, render) {
  const hexes = render._hexes || (render._hexRadius != null ? hexGridCells(render._hexRadius) : hexRhombusCells(render._hexRows, render._hexCols))
  const size = render.cellSize || 30
  const flat = render._flat || false
  const scale = render._scale || 0.95
  const frame = render._frame || null
  const hexColorFn = render._colorFn || null
  const hexTypes = render._hexTypes || null
  const pad = frame ? size * 1.8 : size + 10

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const h of hexes) {
    const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const boardW = (maxX - minX) + pad * 2
  const boardH = (maxY - minY) + pad * 2
  const oX = -minX + pad
  const oY = -minY + pad

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })

  if (!frame) {
    els.push({ op: 'element', tag: 'rect', attrs: { x: 0, y: 0, width: boardW, height: boardH, fill: colors.background, rx: 6 } })
  } else {
    const borderColor = colors.border || '#6b4226'
    const fillPolys = []
    for (const h of hexes) {
      const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
      const corners = hexCorners(oX + p.x, oY + p.y, size * 1.08, flat)
      fillPolys.push({ tag: 'polygon', attrs: { points: corners.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ') } })
    }
    els.push({ op: 'element', tag: 'g', attrs: { fill: borderColor }, children: fillPolys })
    const borderLines = hexBorderEdges(hexes, size, flat, oX, oY, 1.05).map(([a, b]) => (
      { tag: 'line', attrs: { x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2) } }
    ))
    els.push({ op: 'element', tag: 'g', attrs: { fill: 'none', stroke: borderColor, 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, children: borderLines })
  }

  for (const h of hexes) {
    const p = flat ? axialToPixelFlat(h.q, h.r, size) : axialToPixelPointy(h.q, h.r, size)
    const corners = hexCorners(oX + p.x, oY + p.y, size * scale, flat)
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

    el('polygon', { points, fill, stroke: colors.stroke, 'stroke-width': 1, 'data-sq': `${h.q},${h.r}`, class: 'board-cell' })
  }

  if (render._centreMarker) {
    const p = flat ? axialToPixelFlat(0, 0, size) : axialToPixelPointy(0, 0, size)
    el('text', { x: oX + p.x, y: oY + p.y + size * 0.3, 'text-anchor': 'middle', 'font-size': size * 0.8, fill: 'rgba(255,200,50,0.85)', 'pointer-events': 'none' }, render._centreMarker)
  }

  if (render._position && render._pieceImages) {
    const pieces = []
    for (const [key, piece] of Object.entries(render._position)) {
      const [q, r] = key.split(',').map(Number)
      const p = flat ? axialToPixelFlat(q, r, size) : axialToPixelPointy(q, r, size)
      const cx = oX + p.x, cy = oY + p.y
      const pieceId = typeof piece === 'string' ? piece : piece.type
      const imgPath = render._pieceImages[pieceId]
      if (imgPath) {
        const ps = size * 1.6
        pieces.push({ tag: 'image', attrs: { href: imgPath, x: (cx - ps / 2).toFixed(1), y: (cy - ps / 2).toFixed(1), width: ps.toFixed(1), height: ps.toFixed(1) } })
      }
    }
    els.push({ op: 'element', tag: 'g', attrs: { 'pointer-events': 'none' }, children: pieces })
  }

  return { type: 'hex', config: { ops: els, width: boardW, height: boardH } }
}

function produceHexLegacy(topo, colors, render) {
  const cellSize = render.cellSize || 20
  const orientation = render.orientation || topo.orientation || 'pointy'
  const scale = 0.95
  const cellFill = buildHexCellFill(render.cellColor, colors)

  const hasFrame = render.frame && render.frame !== 'none'
  const background = hasFrame ? null : { fill: colors.background || '#f5f5f5', rx: 6 }
  const frame = hasFrame ? {
    stroke: colors.stroke || '#6b4226',
    strokeWidth: 14,
    linecap: 'round',
    linejoin: 'round',
    scale: 1.05,
  } : null

  const centreMarker = render.centreMarker
    ? { q: 0, r: 0, text: render.centreMarker, fontSize: cellSize * 0.8, fill: colors['cell-light'] || '#fff' }
    : null

  const layout = {
    cellSize,
    orientation,
    scale,
    background,
    frame,
    cellFill,
    cellStroke: { color: colors.stroke || 'rgba(0,0,0,0.2)', width: 1 },
    cellImage: null,
    cellLabel: null,
    labelStyle: {},
    overlays: [],
    centreMarker,
  }

  return { type: 'hex', shape: topo.shape, params: hexParams(topo), config: layout }
}

function produceTrackLayout(topo, colors, render) {
  const style = render.trackStyle || 'dots'
  if (style === 'triangular-points') return backgammonOps(colors, render)
  if (style === 'perimeter') return landlordsOps(render)
  return { type: 'track', config: { style, ops: [], width: 0, height: 0 } }
}

// --- Track: backgammon (triangular-points) ops builder ---
//
// Verbatim geometry from the historical backgammon provider — byte-identity
// contract. Colors arrive under provider names (frame, felt, pointA, pointB)
// via mapColorsForProvider; frontmatter is the sole source. Checker face
// colours are fixed piece styling (annotated → piece-theme later).
// Runtime pass-through: render._parsedSetup {dark[], light[]}, _pieceImages.

function backgammonOps(colors, render) {
  const frameW = 16
  const barW = 24
  const pointW = 32
  const panelW = pointW * 6
  const boardW = frameW * 2 + panelW * 2 + barW
  const boardH = 320
  const panelH = boardH - frameW * 2
  const pointH = Math.round(panelH * 0.417)

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })

  el('rect', { x: 0, y: 0, width: boardW, height: boardH, rx: 6, ry: 6, fill: colors.frame })
  el('rect', { x: frameW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW + barW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW, y: 0, width: barW, height: boardH, fill: colors.frame })

  const bottomBase = boardH - frameW
  const topBase = frameW

  const pointX = (i) => {
    const quadrant = Math.floor(i / 6)
    const posInQuad = i % 6
    const isBottom = quadrant === 0 || quadrant === 1
    const isRight = quadrant === 0 || quadrant === 3
    const panelX = isRight ? frameW + panelW + barW : frameW
    return isBottom ? panelX + panelW - (posInQuad + 1) * pointW : panelX + posInQuad * pointW
  }

  for (let i = 0; i < 24; i++) {
    const quadrant = Math.floor(i / 6)
    const posInQuad = i % 6
    const isBottom = quadrant === 0 || quadrant === 1
    const ptColor = ((posInQuad % 2 === 0) === isBottom) ? colors.pointA : colors.pointB
    const lx = pointX(i)
    const x1 = lx, x2 = lx + pointW, tipX = lx + pointW / 2
    if (isBottom) {
      el('polygon', { points: `${x1},${bottomBase} ${x2},${bottomBase} ${tipX},${bottomBase - pointH}`, fill: ptColor, class: 'board-cell', 'data-sq': `point-${i + 1}` })
    } else {
      el('polygon', { points: `${x1},${topBase} ${x2},${topBase} ${tipX},${topBase + pointH}`, fill: ptColor, class: 'board-cell', 'data-sq': `point-${i + 1}` })
    }
  }

  const setup = render._parsedSetup
  if (setup) {
    const pieceSize = 22
    const pieceSpacing = 22
    const pieceImages = render._pieceImages || {}
    const darkImg = pieceImages.bM || pieceImages.b || null
    const lightImg = pieceImages.wM || pieceImages.w || null

    for (let i = 0; i < 24; i++) {
      const dark = setup.dark ? (setup.dark[i] || 0) : 0
      const light = setup.light ? (setup.light[i] || 0) : 0
      if (!dark && !light) continue

      const quadrant = Math.floor(i / 6)
      const isBottom = quadrant === 0 || quadrant === 1
      const cx = pointX(i) + pointW / 2

      const renderStack = (count, img, isDarkPiece, startY, dir) => {
        const maxShow = 5
        const show = Math.min(count, maxShow)
        const overflow = count > maxShow ? count - (maxShow - 1) : 0
        for (let j = 0; j < show; j++) {
          const cy = startY + dir * j * pieceSpacing
          if (img) {
            el('image', { href: img, x: cx - pieceSize / 2, y: cy - pieceSize / 2, width: pieceSize, height: pieceSize })
          } else {
            // Fixed checker face colours (→ piece-theme)
            el('circle', { cx, cy, r: pieceSize / 2 - 1, fill: isDarkPiece ? '#191716' : '#F8F6F2', stroke: isDarkPiece ? '#4d433a' : '#5E5854', 'stroke-width': 1.5 })
          }
          if (j === 0 && overflow > 0) {
            el('text', { x: cx, y: cy + 4, 'font-family': 'sans-serif', 'font-size': 9, 'font-weight': 'bold', 'text-anchor': 'middle', fill: isDarkPiece ? '#fff' : '#333' }, String(overflow))
          }
        }
      }

      if (dark > 0) {
        renderStack(dark, darkImg, true, isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2, isBottom ? -1 : 1)
      }
      if (light > 0) {
        renderStack(light, lightImg, false, isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2, isBottom ? -1 : 1)
      }
    }
  }

  return { type: 'track', config: { style: 'points', ops: els, width: boardW, height: boardH } }
}

// --- Track: landlords (perimeter) ops builder ---
//
// Verbatim move of the historical landlords provider. Board THEMES and
// CATEGORY labels are game data keyed by board id (→ data/landlords-game-
// boards.json / frontmatter; annotated per #18). The per-board decoration
// programs (medallions, split corners, stripes, inner content) select on
// the board id from content.board — declared data, not renderer knowledge.
// Runtime pass-through: render._boardData (JSON), render._board (board id).

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

function landlordsWrapText(text, maxChars) {
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
}

function landlordsCornerOrder(variant, spaces) {
  const corners = spaces.filter(s => s.side === 'corner')
  if (variant === '1932-prosperity') return [corners[1], corners[2], corners[3], corners[0]]
  if (variant === '1906-egc') return [corners[3], corners[0], corners[1], corners[2]]
  return [corners[0], corners[1], corners[2], corners[3]]
}

function landlordsSpaceRect(side, idx, count, cornerSize, boardW, boardH) {
  const spanW = boardW - cornerSize * 2
  const spanH = boardH - cornerSize * 2
  const cellW = spanW / count
  const cellH = spanH / count
  if (side === 'bottom') return { x: boardW - cornerSize - (idx + 1) * cellW, y: boardH - cornerSize, w: cellW, h: cornerSize }
  if (side === 'left') return { x: 0, y: boardH - cornerSize - (idx + 1) * cellH, w: cornerSize, h: cellH }
  if (side === 'top') return { x: cornerSize + idx * cellW, y: 0, w: cellW, h: cornerSize }
  if (side === 'right') return { x: boardW - cornerSize, y: cornerSize + idx * cellH, w: cornerSize, h: cellH }
  return { x: 0, y: 0, w: cellW, h: cellH }
}

function landlordsOps(render) {
  const variant = render._board || '1904-patent'
  const boardData = render._boardData || null
  const board = boardData ? boardData.boards[variant] : null

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })
  const group = (attrs, children) => els.push({ op: 'element', tag: 'g', attrs, children })

  if (!board) {
    el('rect', { x: 0, y: 0, width: 400, height: 60, fill: '#f5e6c8' })
    el('text', { x: 200, y: 35, 'text-anchor': 'middle', 'font-size': 12, fill: '#888' }, `No board data for "${variant}"`)
    return { type: 'track', config: { style: 'perimeter', ops: els, width: 400, height: 60 } }
  }

  const theme = LANDLORDS_THEMES[variant] || LANDLORDS_THEMES['1904-patent']
  const totalSpaces = board.totalSpaces
  const corners = 4
  const perSide = (totalSpaces - corners) / 4
  const spaceW = render.spaceWidth || 56
  const cornerSize = render.cornerSize || 80
  const boardW = cornerSize * 2 + perSide * spaceW
  const boardH = boardW

  el('rect', { x: 0, y: 0, width: boardW, height: boardH, fill: theme.board })
  el('rect', { x: 2, y: 2, width: boardW - 4, height: boardH - 4, fill: 'none', stroke: theme.border, 'stroke-width': 2.5 })

  const spaces = board.spaces
  const sideSpaces = { bottom: [], left: [], top: [], right: [] }
  for (const s of spaces) {
    if (s.side !== 'corner' && sideSpaces[s.side]) sideSpaces[s.side].push(s)
  }

  const cornerOrder = landlordsCornerOrder(variant, spaces)
  const cornerPositions = [
    { x: boardW - cornerSize, y: boardH - cornerSize },
    { x: 0, y: boardH - cornerSize },
    { x: 0, y: 0 },
    { x: boardW - cornerSize, y: 0 },
  ]

  const renderCorner = (space, x, y, size) => {
    const isGoToJail = space.notes && space.notes.includes('Go to Jail')
    const cornerFill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
    el('rect', { x, y, width: size, height: size, fill: cornerFill, stroke: theme.cornerStroke, 'stroke-width': 1.5, class: 'board-cell', 'data-sq': `pos-${space.pos}`, 'data-type': 'corner' })

    if (variant === '1904-patent') {
      // medallion rendered in second pass (after track cells) so it overlaps
    } else if (variant === '1906-egc' && space.split) {
      const sp = space.split
      const spColor = theme[sp.type] || theme.corner
      const mainColor = theme.corner
      const isJail = space.name === 'JAIL'
      if (isJail) {
        el('polygon', { points: `${x},${y} ${x + size},${y} ${x + size},${y + size}`, fill: spColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}b`, 'data-type': sp.type })
        el('polygon', { points: `${x},${y} ${x},${y + size} ${x + size},${y + size}`, fill: mainColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}a`, 'data-type': 'corner' })
        el('line', { x1: x, y1: y, x2: x + size, y2: y + size, stroke: theme.cornerStroke, 'stroke-width': 1 })
        const q1x = x + size * 0.7, q1y = y + size * 0.3
        const q2x = x + size * 0.3, q2y = y + size * 0.7
        el('text', { x: q1x, y: q1y - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sp.name)
        if (sp.tax) el('text', { x: q1x, y: q1y + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, `Tax $${sp.tax}`)
        el('text', { x: q2x, y: q2y, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, space.name)
      } else {
        el('polygon', { points: `${x},${y} ${x + size},${y} ${x},${y + size}`, fill: spColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}b`, 'data-type': sp.type })
        el('polygon', { points: `${x + size},${y} ${x + size},${y + size} ${x},${y + size}`, fill: mainColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}a`, 'data-type': 'corner' })
        el('line', { x1: x, y1: y + size, x2: x + size, y2: y, stroke: theme.cornerStroke, 'stroke-width': 1 })
        const q1x = x + size * 0.3, q1y = y + size * 0.3
        const q2x = x + size * 0.7, q2y = y + size * 0.7
        el('text', { x: q1x, y: q1y, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sp.name)
        el('text', { x: q2x, y: q2y - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, space.name)
        el('text', { x: q2x, y: q2y + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, 'Free')
      }
      el('rect', { x, y, width: size, height: size, fill: 'none', stroke: theme.cornerStroke, 'stroke-width': 1.5 })
      return
    } else if (variant === '1932-prosperity') {
      const cx = x + size / 2, cy = y + size / 2
      const r = size * 0.42
      if (space.name === 'WAGES') {
        const wagesColors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI / 2) - Math.PI / 2
          const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
          el('path', { d: `M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`, fill: 'none', stroke: wagesColors[i], 'stroke-width': 4 })
        }
      } else if (space.fare) {
        el('path', { d: `M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}`, fill: 'none', stroke: theme.cornerArc, 'stroke-width': 3.5 })
      } else if (space.name === 'JAIL') {
        const bw = size * 0.85
        el('rect', { x: cx - bw / 2, y: cy - bw / 2, width: bw, height: bw, fill: 'none', stroke: '#4a4a4a', 'stroke-width': 2 })
        const bars = 4
        const gap = bw / (bars + 1)
        for (let i = 1; i <= bars; i++) {
          el('line', { x1: cx - bw / 2 + i * gap, y1: cy - bw / 2 + 2, x2: cx - bw / 2 + i * gap, y2: cy + bw / 2 - 2, stroke: '#3a3a3a', 'stroke-width': 1.5 })
        }
      }
    }

    const cx = x + size / 2, cy = y + size / 2
    if (variant === '1904-patent') {
      // text rendered in medallion second pass
    } else {
      const lines = landlordsWrapText(space.name, 10)
      const lineH = size > 70 ? 11 : 9
      const nameY = cy - 8
      for (let i = 0; i < lines.length; i++) {
        el('text', { x: cx, y: nameY + i * lineH, 'text-anchor': 'middle', 'font-size': size > 70 ? 8 : 7, 'font-weight': 'bold', 'font-family': 'sans-serif', fill: theme.titleText, 'dominant-baseline': 'central' }, lines[i])
      }
      let subtext = ''
      if (space.fare) subtext = `Fare $${space.fare}`
      else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
      if (subtext) {
        el('text', { x: cx, y: cy + lines.length * lineH / 2 + 8, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'sans-serif', fill: theme.text, 'dominant-baseline': 'central' }, subtext)
      }
    }
  }

  for (let ci = 0; ci < 4; ci++) {
    renderCorner(cornerOrder[ci], cornerPositions[ci].x, cornerPositions[ci].y, cornerSize)
  }

  if (variant === '1904-patent') {
    for (let ci = 0; ci < 4; ci++) {
      const pos = cornerPositions[ci]
      const cx = pos.x + cornerSize / 2, cy = pos.y + cornerSize / 2
      el('circle', { cx, cy, r: cornerSize * 0.72, fill: theme.corner, stroke: theme.cornerStroke, 'stroke-width': 1.5 })
    }
  }

  const renderSpaceTexts = (space, textW, textH) => {
    const children = []
    const t = (attrs, content) => children.push({ tag: 'text', attrs, text: content })
    if (variant === '1932-prosperity') {
      const category = LANDLORDS_CATEGORIES[space.type] || ''
      const narrow = textW < textH
      const fontSize = narrow ? 5 : 6
      const catSize = narrow ? 3.2 : 3.8
      const detSize = narrow ? 3.5 : 4
      const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      t({ 'text-anchor': 'end', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text, opacity: 0.6, x: textW * 0.44, y: -textH * 0.38 }, String(space.pos))
      if (category) {
        t({ 'text-anchor': 'middle', 'font-size': catSize, 'font-family': 'sans-serif', fill: theme.text, x: 0, y: -textH * 0.39 }, category)
      }
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'sans-serif', fill: theme.text, x: 0, y: category ? 2 : 0 }, name)
      let detail = ''
      if (space.rent) detail = `Land Rent $${space.rent}`
      else if (space.tax) detail = `$${space.tax}`
      else if (space.fare) detail = `Fare $${space.fare}`
      else if (space.price && space.type === 'franchise') detail = `$${space.price}`
      if (detail) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'sans-serif', fill: theme.text, x: 0, y: textH * 0.39 }, detail)
      }
    } else if (variant === '1906-egc') {
      const narrow = textW < textH
      const fontSize = narrow ? 4.5 : 6
      const detSize = narrow ? 3.5 : 4.5
      const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      const textColor = space.type === 'chance' ? '#fff' : theme.text
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor, x: 0, y: narrow ? -2 : -4 }, name)
      let detail = ''
      if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
      else if (space.price) detail = `$${space.price}`
      else if (space.rent) detail = `Rent $${space.rent}`
      else if (space.tax) detail = `Tax $${space.tax}`
      else if (space.fare) detail = `Fare $${space.fare}`
      else if (space.fee) detail = `Fee $${space.fee}`
      if (detail) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'serif', fill: textColor, x: 0, y: narrow ? 6 : 8 }, detail)
      }
    } else {
      const narrow = textW < textH
      const fontSize = narrow ? 4.5 : 6
      const detSize = narrow ? 3.5 : 4.5
      const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, x: 0, y: narrow ? -4 : -6 }, name)
      const lines = []
      if (space.rent) lines.push(`Rent $${space.rent}`)
      if (space.price) lines.push(`Sale $${space.price}`)
      if (space.tax) lines.push(`Tax $${space.tax}`)
      if (space.fare) lines.push(`Fare $${space.fare}`)
      if (space.fee) lines.push(`Fee $${space.fee}`)
      if (space.receive) lines.push(`+$${space.receive}`)
      const lineH = narrow ? 6 : 8
      for (let i = 0; i < lines.length; i++) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'serif', fill: theme.text, x: 0, y: (narrow ? 3 : 4) + i * lineH }, lines[i])
      }
    }
    return children
  }

  const sideOrder = ['bottom', 'left', 'top', 'right']
  for (let si = 0; si < 4; si++) {
    const side = sideOrder[si]
    const sideArr = sideSpaces[side]
    if (!sideArr.length) continue
    for (let i = 0; i < sideArr.length; i++) {
      const space = sideArr[i]
      const { x, y, w, h } = landlordsSpaceRect(side, i, sideArr.length, cornerSize, boardW, boardH)
      const typeFill = theme[space.type] || '#f0f0f0'
      const strokeW = variant === '1904-patent' ? 1.5 : 0.75
      el('rect', { x, y, width: w, height: h, fill: typeFill, stroke: theme.spaceStroke, 'stroke-width': strokeW, class: 'board-cell', 'data-sq': `pos-${space.pos}`, 'data-type': space.type })

      if (variant === '1932-prosperity') {
        const stripeColor = theme[space.type + 'Stripe']
        if (stripeColor) {
          const bandRatio = 0.22
          const lineW = 1.2
          const bh = h * bandRatio
          el('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: bh, fill: stripeColor, opacity: 0.35 })
          el('line', { x1: x + 0.5, y1: y + bh, x2: x + w - 0.5, y2: y + bh, stroke: stripeColor, 'stroke-width': lineW })
          el('rect', { x: x + 0.5, y: y + h - bh - 0.5, width: w - 1, height: bh, fill: stripeColor, opacity: 0.35 })
          el('line', { x1: x + 0.5, y1: y + h - bh, x2: x + w - 0.5, y2: y + h - bh, stroke: stripeColor, 'stroke-width': lineW })
        }
      }

      group({ transform: `translate(${x + w / 2},${y + h / 2}) rotate(0)` }, renderSpaceTexts(space, w, h))
    }
  }

  if (variant === '1904-patent') {
    for (let ci = 0; ci < 4; ci++) {
      const space = cornerOrder[ci]
      const pos = cornerPositions[ci]
      const cx = pos.x + cornerSize / 2, cy = pos.y + cornerSize / 2
      const r = cornerSize * 0.72
      const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
      const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
      const lines = landlordsWrapText(space.name, maxChars)
      const lineH = fontSize + 3
      const blockH = lines.length * lineH
      const startY = cy - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
      for (let i = 0; i < lines.length; i++) {
        el('text', { x: cx, y: startY + i * lineH, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText, 'dominant-baseline': 'central' }, lines[i])
      }
      if (space.notes) {
        const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
        el('text', { x: cx, y: startY + blockH + 4, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sub)
      }
    }
  }

  landlordsInner(el, board, cornerSize, boardW, boardH, theme, variant)

  return { type: 'track', config: { style: 'perimeter', ops: els, width: boardW, height: boardH } }
}

function landlordsInner(el, board, cornerSize, boardW, boardH, theme, variant) {
  const innerX = cornerSize, innerY = cornerSize
  const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
  el('rect', { x: innerX, y: innerY, width: innerW, height: innerH, fill: theme.innerBg })

  const cx = boardW / 2, cy = boardH / 2

  if (variant === '1932-prosperity') {
    const r = innerW * 0.32
    const b = r / Math.SQRT2
    const c = r * (1 - 1 / Math.SQRT2)
    const pts = [
      [0, -r], [c, -b], [b, -b], [b, -c],
      [r, 0], [b, c], [b, b], [c, b],
      [0, r], [-c, b], [-b, b], [-b, c],
      [-r, 0], [-b, -c], [-b, -b], [-c, -b],
    ].map(([px, py]) => `${cx + px},${cy + py}`).join(' ')
    el('polygon', { points: pts, fill: 'none', stroke: theme.titleText, 'stroke-width': 2.5 })
    el('text', { x: cx, y: cy - 16, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, 'THE')
    el('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, "LANDLORD'S GAME")
    el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 8, 'font-family': 'serif', fill: theme.titleText }, 'AND PROSPERITY')
    el('text', { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'serif', fill: theme.text }, 'A Magie Game — Patent No. 1,509,312')
    el('text', { x: cx, y: cy + 46, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'Adgame Company (Inc.), Washington, D.C.')

    const labelOff = 14
    el('text', { x: cx, y: innerY + labelOff, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#c8b020' }, 'Your Checker Yellow')
    el('text', { x: cx, y: innerY + innerH - labelOff + 4, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#2a5a9a' }, 'Your Checker Blue')
    el('text', { x: innerX + labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#3a8a3a', transform: `rotate(-90,${innerX + labelOff},${cy})` }, 'Your Checker Green')
    el('text', { x: innerX + innerW - labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#8c2020', transform: `rotate(90,${innerX + innerW - labelOff},${cy})` }, 'Your Checker Red')

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

    el('text', { x: leftMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(-90,${leftMid},${cy})` }, 'General Land Office')
    el('text', { x: rightMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(90,${rightMid},${cy})` }, 'Public Treasury')

    const boxW = innerW * 0.14
    const boxH = innerH * 0.08
    const textHalfLen = 32
    const arrowGap = 4

    const leftBoxTopY = (innerY + starTop) / 2
    const leftBoxBotY = (innerY + innerH + starBot) / 2
    const leftArrowTopStart = cy - textHalfLen - arrowGap
    const leftArrowBotStart = cy + textHalfLen + arrowGap

    el('line', { x1: leftMid, y1: leftArrowTopStart, x2: leftMid, y2: leftBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${leftMid - 2},${leftBoxTopY + boxH / 2 + 5} L ${leftMid},${leftBoxTopY + boxH / 2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: leftMid - boxW / 2, y: leftBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-1', 'data-type': 'land-in-use' })
    el('text', { x: leftMid, y: leftBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'For Sale')
    el('text', { x: leftMid, y: leftBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Land in Use')

    el('line', { x1: leftMid, y1: leftArrowBotStart, x2: leftMid, y2: leftBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${leftMid - 2},${leftBoxBotY - boxH / 2 - 5} L ${leftMid},${leftBoxBotY - boxH / 2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: leftMid - boxW / 2, y: leftBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-2', 'data-type': 'idle-land' })
    el('text', { x: leftMid, y: leftBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'For Sale')
    el('text', { x: leftMid, y: leftBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Idle Land')

    const rightBoxTopY = leftBoxTopY
    const rightBoxBotY = leftBoxBotY
    const rightArrowTopStart = cy - textHalfLen - arrowGap
    const rightArrowBotStart = cy + textHalfLen + arrowGap

    el('line', { x1: rightMid, y1: rightArrowTopStart, x2: rightMid, y2: rightBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${rightMid - 2},${rightBoxTopY + boxH / 2 + 5} L ${rightMid},${rightBoxTopY + boxH / 2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: rightMid - boxW / 2, y: rightBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-3', 'data-type': 'general-fund' })
    el('text', { x: rightMid, y: rightBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'General Fund')
    el('text', { x: rightMid, y: rightBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, '')

    el('line', { x1: rightMid, y1: rightArrowBotStart, x2: rightMid, y2: rightBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${rightMid - 2},${rightBoxBotY - boxH / 2 - 5} L ${rightMid},${rightBoxBotY - boxH / 2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: rightMid - boxW / 2, y: rightBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-4', 'data-type': 'rent-fund' })
    el('text', { x: rightMid, y: rightBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Prosperity Land')
    el('text', { x: rightMid, y: rightBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Rent Fund')
  } else if (variant === '1906-egc') {
    el('text', { x: cx, y: cy - 20, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, 'MISCELLANEOUS')
    el('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, 'PUBLIC TREASURY')
    el('text', { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'MONEY DENOMINATIONS')

    const coinY = cy + 34
    const coins = ['$1', '$5', '$10', '$50', '$100']
    const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
    const coinR = 7
    const coinGap = 20
    const coinStartX = cx - (coins.length - 1) * coinGap / 2
    for (let i = 0; i < coins.length; i++) {
      const coinX = coinStartX + i * coinGap
      const textColor = i === 0 ? theme.text : '#fff'
      el('circle', { cx: coinX, cy: coinY, r: coinR, fill: coinColors[i], stroke: theme.spaceStroke, 'stroke-width': 0.75 })
      el('text', { x: coinX, y: coinY + 2, 'text-anchor': 'middle', 'font-size': 4, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor }, coins[i])
    }

    el('text', { x: cx, y: cy + 58, 'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, "The Landlord's Game")
    el('text', { x: cx, y: cy + 69, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text }, 'Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie')
    el('text', { x: cx, y: cy + 79, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'Economic Game Co., New York')

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
        el('polygon', { points: L.pts, fill, stroke, 'stroke-width': 1.2, class: 'board-cell', 'data-sq': `inner-${i + 1}`, 'data-type': 'natural-opportunity' })
        el('text', { x: L.tx, y: L.ty - 4, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, 'Natural Opportunity')
        el('text', { x: L.tx, y: L.ty + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, 'to Labor')
        el('text', { x: L.tx2, y: L.ty2 - 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, no.name)
        el('text', { x: L.tx2, y: L.ty2 + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, `Wages $${no.wages}`)
        el('text', { x: L.tx2, y: L.ty2 + 10, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, `Rent $${no.rent}`)
      }

      const cellFill = theme.lot
      const patchW = 1.5
      const fill2 = '#d4c060'
      // TIMBERLAND (BR) → WAYBACK pos 1, bottom side idx 0 (rightmost on bottom)
      const br_cx = innerX + innerW - cellW / 2
      el('rect', { x: br_cx - cellW / 2, y: innerY + innerH - patchW, width: cellW, height: patchW, fill: fill2 })
      el('rect', { x: br_cx - cellW / 2, y: innerY + innerH, width: cellW, height: patchW, fill: cellFill })
      // FARMLANDS (BL) → BOOMTOWN pos 11, left side idx 0 (lowest on left)
      const bl_cy = innerY + innerH - cellH / 2
      el('rect', { x: innerX - patchW, y: bl_cy - cellH / 2, width: patchW, height: cellH, fill: cellFill })
      el('rect', { x: innerX, y: bl_cy - cellH / 2, width: patchW, height: cellH, fill: fill2 })
      // COAL MINES (TL) → EASY STREET pos 21, top side idx 0 (leftmost on top)
      const tl_cx = innerX + cellW / 2
      el('rect', { x: tl_cx - cellW / 2, y: innerY, width: cellW, height: patchW, fill: fill2 })
      el('rect', { x: tl_cx - cellW / 2, y: innerY - patchW, width: cellW, height: patchW, fill: cellFill })
      // OIL FIELDS (TR) → BROADWAY pos 31, right side idx 0 (topmost on right)
      const tr_cy = innerY + cellH / 2
      el('rect', { x: innerX + innerW - patchW, y: tr_cy - cellH / 2, width: patchW, height: cellH, fill: fill2 })
      el('rect', { x: innerX + innerW, y: tr_cy - cellH / 2, width: patchW, height: cellH, fill: cellFill })
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
      el('rect', { x: q.x, y: q.y, width: qw, height: qh, fill: theme.innerBg, stroke: theme.spaceStroke, 'stroke-width': sw, class: 'board-cell', 'data-sq': q.sq, 'data-type': q.label.toLowerCase() })
      const qcx = q.x + qw / 2, qcy = q.y + qh / 2
      if (q.label === 'PUBLIC TREASURY') {
        el('text', { x: qcx, y: qcy - 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, 'PUBLIC')
        el('text', { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, 'TREASURY')
      } else {
        el('text', { x: qcx, y: qcy + (q.sub ? -2 : 4), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, q.label)
        if (q.sub) el('text', { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, q.sub)
      }
    }

    el('text', { x: cx, y: innerY + innerH - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'L.J. Magie, Patent No. 748,626')
  }
}

function producePitLayout(topo, colors, render) {
  return producePitOps(topo, colors, render)
}

// --- Pit (mancala) ops builder ---
//
// Emits the full drawing program for renderPitLayout() from resolved
// frontmatter. Geometry is a verbatim move from the historical mancala
// provider — byte-identity contract (attribute order, element order).
// Colors arrive under provider names (via mapColorsForProvider) with
// frontmatter as the sole source of truth.
//
// Frontmatter fields consumed: topology.rows/cols/stores,
// render.cellSize (pit radius), render.boardShape, render.cornerRadius,
// render.markers, render.pitCurve, render.storeSize [rx, ry],
// render._parsedSetup / _seedsPerPit / _pieceImages (runtime pass-through).

function producePitOps(topo, colors, render) {
  const pitsPerSide = topo.cols || 6
  const boardRows = topo.rows || 2
  const hasStores = topo.stores !== false
  const pitRadius = render.cellSize || 22
  const storeRx = render.storeSize?.[0] || 24
  const storeRy = render.storeSize?.[1] || 50
  const boardShape = render.boardShape || 'rect'
  const rx = render.cornerRadius || 22
  const pitCurve = render.pitCurve || 0
  const markerSet = new Set(render.markers || [])
  const parsedSetup = render._parsedSetup || null
  const seedsPerPit = render._seedsPerPit || 4
  const pieceImages = render._pieceImages || null
  const seedRadius = Math.min(4.5, pitRadius * 0.2)

  const els = []
  const el = (tag, attrs) => els.push({ op: 'element', tag, attrs })

  const seeds = (cx, cy, count) => {
    if (count <= 0) return
    if (pieceImages && pieceImages[String(count)]) {
      const size = pitRadius * 1.6
      el('image', { href: pieceImages[String(count)], x: cx - size / 2, y: cy - size / 2, width: size, height: size, 'pointer-events': 'none' })
      return
    }
    for (const [sx, sy] of seedLayout(count, seedRadius)) {
      el('circle', { cx: cx + sx, cy: cy + sy, r: seedRadius, fill: colors.seed, stroke: colors.seedStroke, 'stroke-width': 0.5 })
    }
  }

  const marker = (cx, cy) => {
    el('circle', { cx, cy, r: pitRadius - 8, fill: 'none', stroke: colors.marker, 'stroke-width': 2, 'stroke-dasharray': '4,3' })
  }

  const pit = (cx, cy, idx) => {
    el('circle', { cx, cy, r: pitRadius, fill: colors.pit, stroke: colors.pitStroke, 'stroke-width': 1.5, class: 'board-cell', 'data-sq': `pit-${idx}` })
  }

  const store = (cx, cy, sq) => {
    el('ellipse', { cx, cy, rx: storeRx, ry: storeRy, fill: colors.pit, stroke: colors.pitStroke, 'stroke-width': 1.5, class: 'board-cell', 'data-sq': sq })
  }

  const seedCountAt = (idx) => (parsedSetup && parsedSetup.pits) ? parsedSetup.pits[idx] : seedsPerPit

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
    const cx = boardW / 2, cy = boardH / 2

    el('ellipse', { cx, cy, rx: outerRx, ry: outerRy, fill: colors.boardOuter })
    el('ellipse', { cx, cy, rx: outerRx - 8, ry: outerRy - 8, fill: colors.boardInner })

    if (hasStores) {
      store(cx - storeCenterOffset, cy, 'store-1')
      store(cx + storeCenterOffset, cy, 'store-0')
    }

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
      pit(px, topY, topIdx)
      pit(px, botY, pitsPerSide + botIdx)
      if (markerSet.has(topIdx)) marker(px, topY)
      if (markerSet.has(pitsPerSide + botIdx)) marker(px, botY)
      seeds(px, topY, seedCountAt(topIdx))
      seeds(px, botY, seedCountAt(pitsPerSide + botIdx))
    }

    return { type: 'pit', config: { ops: els, width: boardW, height: boardH } }
  }

  const pad = render.padEdge || pitRadius * 1.65
  const frameInset = 16
  const interRow = pitRadius * 2.4
  const divGap = boardRows === 4 ? pitRadius * 2.7 : 0
  const contentH = boardRows === 4 ? interRow * 2 + divGap : interRow * (boardRows - 1)
  const boardH = contentH + pad * 2 + frameInset * 2
  const storeWidth = hasStores ? storeRx * 2 + 16 : 0
  const pitsAreaWidth = pitsPerSide * (pitRadius * 2 + 10)
  const boardW = storeWidth * 2 + pitsAreaWidth + pad * 2 + frameInset * 2

  const bx = frameInset / 2, by = frameInset / 2
  const bw = boardW - frameInset, bh = boardH - frameInset

  el('rect', { x: bx, y: by, width: bw, height: bh, rx, ry: rx, fill: colors.boardOuter })
  el('rect', { x: bx + 6, y: by + 6, width: bw - 12, height: bh - 12, rx: rx - 4, ry: rx - 4, fill: colors.boardInner })
  if (colors.border) {
    const attrs = { x: bx + 12, y: by + 12, width: bw - 24, height: bh - 24, rx: rx - 8, ry: rx - 8, fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }
    if (colors.borderDash) attrs['stroke-dasharray'] = colors.borderDash
    el('rect', attrs)
  }

  if (hasStores) {
    const storeCy = boardH / 2
    store(frameInset + storeWidth / 2, storeCy, 'store-1')
    store(boardW - frameInset - storeWidth / 2, storeCy, 'store-0')
  }

  const pitsLeftEdge = frameInset + (hasStores ? storeWidth : 0) + pad
  const pitsRightEdge = boardW - frameInset - (hasStores ? storeWidth : 0) - pad
  const pitsAvailWidth = pitsRightEdge - pitsLeftEdge
  const pitSpacing = pitsPerSide > 1 ? pitsAvailWidth / (pitsPerSide - 1) : 0

  const topPitCenter = frameInset + pad
  const botPitCenter = boardH - frameInset - pad
  const rowCenters = []
  if (boardRows === 2) {
    rowCenters.push(topPitCenter, botPitCenter)
  } else if (boardRows === 4) {
    rowCenters.push(topPitCenter, topPitCenter + interRow, botPitCenter - interRow, botPitCenter)
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
      pit(cx, cy, pitIdx)
      if (markerSet.has(pitIdx)) marker(cx, cy)
      seeds(cx, cy, seedCountAt(pitIdx))
    }
  }

  if (boardRows === 4) {
    const divY = boardH / 2
    el('line', { x1: pitsLeftEdge - pitRadius, y1: divY, x2: pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius, y2: divY, stroke: colors.boardOuter, 'stroke-width': 2.5, 'stroke-dasharray': '6,4' })
  }

  return { type: 'pit', config: { ops: els, width: boardW, height: boardH } }
}

// Seed packing geometry (drawing-layout data factory, game-agnostic)
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

function produceGraphLayout(topo, colors, render) {
  const structure = topo.structure || 'concentric-rings'
  const params = topo.params || {}
  const size = render.canvasSize || 320
  const pointRadius = render.nodeRadius || (structure === 'star' ? 2.5 : structure === 'grid-cross' ? 6 : 7)

  switch (structure) {
    case 'perimeter-cross': return { type: 'graph', config: { ops: nyoutOps(size, 0, 0, colors, pointRadius), width: size, height: size } }
    case 'concentric-rings': return { type: 'graph', config: { ops: morrisOps(size, 0, 0, colors, pointRadius, params), width: size, height: size } }
    case 'grid-cross': return { type: 'graph', config: { ops: asaltoOps(size, 0, 0, colors, pointRadius, params, render), width: size, height: size } }
    case 'star': return produceSternHalmaLayout(colors, render, pointRadius)
    default: return { type: 'graph', config: { ops: [], width: size, height: size } }
  }
}

// --- Graph structure generators + ops builders ---

function nyoutStations(size, ox, oy) {
  const margin = size * 0.08
  const nodes = [], edges = []
  const x0 = ox + margin, x1 = ox + size - margin
  const y0 = oy + margin, y1 = oy + size - margin
  const cx = ox + size / 2, cy = oy + size / 2
  const corners = [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y0 }]
  const outerNodes = []
  for (let side = 0; side < 4; side++) {
    const from = corners[side], to = corners[(side + 1) % 4]
    outerNodes.push(from)
    for (let i = 1; i <= 4; i++) outerNodes.push({ x: from.x + (to.x - from.x) * i / 5, y: from.y + (to.y - from.y) * i / 5 })
  }
  for (let i = 0; i < 20; i++) edges.push([i, (i + 1) % 20])
  for (const n of outerNodes) nodes.push(n)
  nodes.push({ x: cx, y: cy })
  const nw = corners[2], se = corners[0]
  nodes.push({ x: nw.x + (cx - nw.x) * 1 / 3, y: nw.y + (cy - nw.y) * 1 / 3 })
  nodes.push({ x: nw.x + (cx - nw.x) * 2 / 3, y: nw.y + (cy - nw.y) * 2 / 3 })
  nodes.push({ x: cx + (se.x - cx) * 1 / 3, y: cy + (se.y - cy) * 1 / 3 })
  nodes.push({ x: cx + (se.x - cx) * 2 / 3, y: cy + (se.y - cy) * 2 / 3 })
  const ne = corners[3], sw = corners[1]
  nodes.push({ x: ne.x + (cx - ne.x) * 1 / 3, y: ne.y + (cy - ne.y) * 1 / 3 })
  nodes.push({ x: ne.x + (cx - ne.x) * 2 / 3, y: ne.y + (cy - ne.y) * 2 / 3 })
  nodes.push({ x: cx + (sw.x - cx) * 1 / 3, y: cy + (sw.y - cy) * 1 / 3 })
  nodes.push({ x: cx + (sw.x - cx) * 2 / 3, y: cy + (sw.y - cy) * 2 / 3 })
  edges.push([10, 21], [21, 22], [22, 20], [20, 23], [23, 24], [24, 0])
  edges.push([15, 25], [25, 26], [26, 20], [20, 27], [27, 28], [28, 5])
  const junctions = new Set([0, 5, 10, 15, 20])
  return { nodes, edges, junctions }
}

function nyoutOps(size, ox, oy, colors, pointRadius) {
  const { nodes, edges, junctions } = nyoutStations(size, ox, oy)
  const dotR = (i) => i === 20 ? pointRadius * 1.4 : junctions.has(i) ? pointRadius * 1.2 : pointRadius
  return [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'edges', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, nodes, pairs: edges },
    { op: 'nodes', group: {}, items: nodes,
      dot: { radius: (n, i) => dotR(i), fill: (n, i) => i === 20 ? colors.centre : junctions.has(i) ? colors.junction : colors.point },
      hit: { radius: (n, i) => dotR(i) * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
  ]
}

function morrisRings(rings, size, ox, oy) {
  const rects = []
  const margin = size * 0.0625, maxInset = size * 0.375
  const step = rings > 1 ? (maxInset - margin) / (rings - 1) : 0
  for (let i = 0; i < rings; i++) {
    const inset = margin + i * step
    rects.push({ x: ox + inset, y: oy + inset, w: size - inset * 2, h: size - inset * 2 })
  }
  return rects
}

function morrisPoints(ringRects, midpoints, cx, cy, rings) {
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

function morrisOps(size, ox, oy, colors, pointRadius, params) {
  const rings = params.rings || 3
  const diagonals = params.diagonals || false
  const midpoints = params.midpoints !== false
  const cx = ox + size / 2, cy = oy + size / 2
  const ringRects = morrisRings(rings, size, ox, oy)
  const structure = []
  for (const rect of ringRects) structure.push({ tag: 'rect', attrs: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } })
  if (midpoints) {
    if (rings === 1) {
      const r = ringRects[0]
      structure.push({ tag: 'line', attrs: { x1: cx, y1: r.y, x2: cx, y2: r.y + r.h } })
      structure.push({ tag: 'line', attrs: { x1: r.x, y1: cy, x2: r.x + r.w, y2: cy } })
    } else {
      structure.push({ tag: 'line', attrs: { x1: cx, y1: ringRects[0].y, x2: cx, y2: ringRects[rings - 1].y } })
      const last = ringRects[rings - 1]
      structure.push({ tag: 'line', attrs: { x1: cx, y1: last.y + last.h, x2: cx, y2: ringRects[0].y + ringRects[0].h } })
      structure.push({ tag: 'line', attrs: { x1: ringRects[0].x, y1: cy, x2: ringRects[rings - 1].x, y2: cy } })
      structure.push({ tag: 'line', attrs: { x1: last.x + last.w, y1: cy, x2: ringRects[0].x + ringRects[0].w, y2: cy } })
    }
  }
  if (diagonals) {
    if (rings === 1) {
      const r = ringRects[0]
      structure.push({ tag: 'line', attrs: { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h } })
      structure.push({ tag: 'line', attrs: { x1: r.x + r.w, y1: r.y, x2: r.x, y2: r.y + r.h } })
    } else {
      const o = ringRects[0], i = ringRects[rings - 1]
      structure.push({ tag: 'line', attrs: { x1: o.x, y1: o.y, x2: i.x, y2: i.y } })
      structure.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y, x2: i.x + i.w, y2: i.y } })
      structure.push({ tag: 'line', attrs: { x1: o.x, y1: o.y + o.h, x2: i.x, y2: i.y + i.h } })
      structure.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y + o.h, x2: i.x + i.w, y2: i.y + i.h } })
    }
  }
  const points = morrisPoints(ringRects, midpoints, cx, cy, rings)
  return [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'group', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'square' }, children: structure },
    { op: 'nodes', group: { fill: colors.point }, items: points,
      dot: { radius: pointRadius },
      hit: { radius: pointRadius * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
  ]
}

const DEFAULT_ASALTO_GRID = {
  rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]],
  fortressRows: 2, fortressExtraRow: 2, fortressCols: [2,3,4],
}

function asaltoNodes(size, ox, oy, gridDef) {
  const nodes = [], edges = [], fortressNodes = new Set()
  const rowDefs = gridDef.rows.map((cols, y) => ({ cols, y }))
  const fortressRowCount = gridDef.fortressRows || 2
  const maxCol = Math.max(...rowDefs.flatMap(r => r.cols))
  const maxRow = rowDefs.length - 1
  const margin = size * 0.08
  const usable = size - margin * 2
  const hGaps = maxCol, vGaps = maxRow
  const spacing = usable / Math.max(hGaps, vGaps)
  const xOffset = ox + (size - hGaps * spacing) / 2
  const yOffset = oy + (size - vGaps * spacing) / 2
  const fortressExtraRow = gridDef.fortressExtraRow
  const fortressCols = gridDef.fortressCols || null
  const nodeMap = {}
  for (const row of rowDefs) {
    for (const col of row.cols) {
      const idx = nodes.length
      nodeMap[`${row.y},${col}`] = idx
      nodes.push({ x: xOffset + col * spacing, y: yOffset + row.y * spacing })
      if (row.y < fortressRowCount) fortressNodes.add(idx)
      else if (row.y === fortressExtraRow && fortressCols && fortressCols.includes(col)) fortressNodes.add(idx)
    }
  }
  for (const row of rowDefs) {
    for (let i = 0; i < row.cols.length - 1; i++) {
      if (row.cols[i + 1] - row.cols[i] === 1) edges.push([nodeMap[`${row.y},${row.cols[i]}`], nodeMap[`${row.y},${row.cols[i + 1]}`]])
    }
  }
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) { if (r2.cols.includes(col)) edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col}`]]) }
  }
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) {
      if (r1.cols.includes(col + 1) && r2.cols.includes(col) && r2.cols.includes(col + 1)) {
        edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col + 1}`]])
        edges.push([nodeMap[`${r1.y},${col + 1}`], nodeMap[`${r2.y},${col}`]])
      }
    }
  }
  if (gridDef.extraNodes) {
    for (const extra of gridDef.extraNodes) {
      const idx = nodes.length
      nodes.push({ x: xOffset + extra.col * spacing, y: yOffset + extra.row * spacing })
      if (extra.fortress) fortressNodes.add(idx)
      for (const target of extra.connectsTo) { const tIdx = nodeMap[`${target[0]},${target[1]}`]; if (tIdx !== undefined) edges.push([idx, tIdx]) }
    }
  }
  return { nodes, edges, fortressNodes, nodeMap }
}

function asaltoFortressElements(nodes, fortressNodes, nodeMap, gridDef, colors) {
  const fNodes = [...fortressNodes].map(i => nodes[i])
  if (fNodes.length === 0) return []
  const parts = []
  const hasEars = gridDef.extraNodes && gridDef.extraNodes.some(n => n.fortress)
  const bodyNodes = fNodes.filter(n => {
    if (!hasEars) return true
    const extras = gridDef.extraNodes.filter(e => e.fortress)
    return !extras.some(e => {
      const ex = nodes[nodes.length - gridDef.extraNodes.length + gridDef.extraNodes.indexOf(e)]
      return Math.abs(n.x - ex.x) < 0.1 && Math.abs(n.y - ex.y) < 0.1
    })
  })
  const bx = Math.min(...bodyNodes.map(n => n.x))
  const by = Math.min(...bodyNodes.map(n => n.y))
  const bw = Math.max(...bodyNodes.map(n => n.x)) - bx
  const bh = Math.max(...bodyNodes.map(n => n.y)) - by
  parts.push({ tag: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: colors.fortress, stroke: 'none' } })
  if (hasEars) {
    const extras = gridDef.extraNodes.filter(e => e.fortress)
    const totalNodes = nodes.length, extraStart = totalNodes - gridDef.extraNodes.length
    for (const e of extras) {
      const eIdx = gridDef.extraNodes.indexOf(e)
      const ear = nodes[extraStart + eIdx]
      const targets = e.connectsTo.map(t => nodes[nodeMap[`${t[0]},${t[1]}`]])
      if (targets.length >= 2) {
        const tri = `${ear.x},${ear.y} ${targets[0].x},${targets[0].y} ${targets[1].x},${targets[1].y}`
        parts.push({ tag: 'polygon', attrs: { points: tri, fill: colors.fortress, stroke: 'none' } })
      }
    }
  }
  parts.push({ tag: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: colors.fortressBorder, 'stroke-width': 2 } })
  return parts
}

function asaltoOps(size, ox, oy, colors, pointRadius, params, render) {
  const gridDef = params.rows ? params : DEFAULT_ASALTO_GRID
  const { nodes, edges, fortressNodes, nodeMap } = asaltoNodes(size, ox, oy, gridDef)
  const ops = [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'elements', items: asaltoFortressElements(nodes, fortressNodes, nodeMap, gridDef, colors) },
    { op: 'edges', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2, 'stroke-linecap': 'round' }, nodes, pairs: edges },
    { op: 'nodes', group: { fill: colors.point }, items: nodes,
      dot: { radius: pointRadius, fill: colors.point },
      hit: { radius: pointRadius * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
  ]
  const position = render._position || {}
  const pieceImages = render._pieceImages || {}
  const pieceSize = pointRadius * 3.5
  const pieces = []
  for (let i = 0; i < nodes.length; i++) {
    const sq = `n${i + 1}`, piece = position[sq]
    if (!piece) continue
    const p = typeof piece === 'object' ? piece : { type: String(piece) }
    const href = pieceImages[p.type]
    if (href) {
      pieces.push({ tag: 'image', attrs: { href, x: nodes[i].x - pieceSize / 2, y: nodes[i].y - pieceSize / 2, width: pieceSize, height: pieceSize, 'pointer-events': 'none' } })
    } else {
      const fill = p.type.includes('red') ? '#cc2222' : '#44aa44'
      const stroke = p.type.includes('red') ? '#881111' : '#227722'
      pieces.push({ tag: 'circle', attrs: { cx: nodes[i].x, cy: nodes[i].y, r: pointRadius * 1.5, fill, stroke, 'stroke-width': 1.5 } })
    }
  }
  ops.push({ op: 'elements', items: pieces })
  return ops
}

function produceSternHalmaLayout(colors, render, _unused) {
  const spacing = render.cellSize || 24
  const pieceR = spacing * 0.19
  const rim = spacing * 1.2, margin = spacing * 2.5
  const innerW = spacing * 16 + margin * 2
  const innerH = Math.round(spacing * Math.sqrt(3) / 2 * 16) + margin * 2 + spacing
  const boardW = innerW + rim * 2, boardH = innerH + rim * 2
  const ox = 0, oy = 0
  const rowH = spacing * Math.sqrt(3) / 2
  const cx = ox + rim + spacing * 8 + margin, topY = oy + rim + margin + spacing * 0.5
  const rowWidths = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]
  const positions = [], arms = { N: [], NE: [], SE: [], S: [], SW: [], NW: [] }
  for (let row = 0; row < 17; row++) {
    const w = rowWidths[row], y = topY + row * rowH, startX = cx - (w - 1) * spacing / 2
    for (let i = 0; i < w; i++) {
      const x = startX + i * spacing, idx = positions.length
      positions.push({ x, y, row, col: i })
      if (row < 4) arms.N.push(idx)
      else if (row >= 13) arms.S.push(idx)
      else if (row >= 4 && row <= 7) { const armWidth = 4 - (row - 4); if (i < armWidth) arms.NW.push(idx); else if (i >= w - armWidth) arms.NE.push(idx) }
      else if (row >= 9 && row <= 12) { const armWidth = row - 8; if (i < armWidth) arms.SW.push(idx); else if (i >= w - armWidth) arms.SE.push(idx) }
    }
  }
  const s = spacing / 24, midY = topY + 8 * rowH, polyScale = 1.04
  const hex = [[-50.5, -93], [50.5, -93], [104.3, 0], [50.5, 92.9], [-50.5, 92.9], [-104.3, 0]].map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
  const tips = [[0, -180.3], [158, -93], [158, 92.9], [0, 180.3], [-158, 92.9], [-158, -93]].map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
  const holeArm = new Array(positions.length).fill('')
  for (const [armName, idxs] of Object.entries(arms)) { for (const idx of idxs) holeArm[idx] = armName }
  const items = positions.map((hp, i) => ({ x: hp.x, y: hp.y, arm: holeArm[i] }))
  const armFills = [colors.armN, colors.armNE, colors.armSE, colors.armS, colors.armSW, colors.armNW]
  const armPolys = []
  for (let i = 0; i < 6; i++) {
    armPolys.push({ tag: 'polygon', attrs: { points: `${tips[i].x},${tips[i].y} ${hex[i].x},${hex[i].y} ${hex[(i + 1) % 6].x},${hex[(i + 1) % 6].y}`, fill: armFills[i] } })
  }
  const ops = [
    { op: 'element', tag: 'defs', children: [{ tag: 'filter', attrs: { id: 'board-shadow', x: '-5%', y: '-3%', width: '110%', height: '110%' }, children: [{ tag: 'feDropShadow', attrs: { dx: 0, dy: 4, stdDeviation: 6, 'flood-color': 'rgba(0,0,0,0.35)' } }] }] },
    { op: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, fill: colors.boardBody, rx: 18, filter: 'url(#board-shadow)' } },
    { op: 'rect', attrs: { x: ox + 3, y: oy + 3, width: boardW - 6, height: boardH - 6, fill: colors.boardRim, rx: 15 } },
    { op: 'rect', attrs: { x: ox + rim, y: oy + rim, width: innerW, height: innerH, fill: colors.boardFelt, rx: 6 } },
    { op: 'element', tag: 'polygon', attrs: { points: hex.map(v => `${v.x},${v.y}`).join(' '), fill: colors.centre } },
    { op: 'elements', items: armPolys },
    { op: 'element', tag: 'polygon', attrs: { points: `${tips[0].x},${tips[0].y} ${tips[4].x},${tips[4].y} ${tips[2].x},${tips[2].y}`, fill: 'none', stroke: colors.outline, 'stroke-width': 1.5 } },
    { op: 'element', tag: 'polygon', attrs: { points: `${tips[3].x},${tips[3].y} ${tips[5].x},${tips[5].y} ${tips[1].x},${tips[1].y}`, fill: 'none', stroke: colors.outline, 'stroke-width': 1.5 } },
    { op: 'nodes', group: { fill: colors.hole, opacity: 0.7 }, items,
      dot: { radius: 2.5 },
      hit: { radius: pieceR, id: (n, i) => `h${i + 1}`, dataType: (n) => n.arm ? 'arm-' + n.arm : 'centre', extraAttrs: (n) => n.arm ? { 'data-arm': n.arm } : null } },
  ]
  const filledArms = render._filledArms || []
  const pieceImages = render._pieceImages || {}
  const armPieceKeys = ['red-circle', 'blue-circle', 'green-circle', 'black-circle', 'purple-circle', 'brown-circle']
  const armColors = ['#d32f2f', '#1565c0', '#2e7d32', '#1a1a1a', '#6a1b9a', '#5d4037']
  const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
  const pieceSz = pieceR * 1.6
  const pieces = []
  for (let a = 0; a < filledArms.length; a++) {
    const armName = filledArms[a], holeIdxs = arms[armName]
    const colorIdx = armOrder.indexOf(armName)
    const img = pieceImages[armPieceKeys[colorIdx]] || null
    const color = armColors[colorIdx] || armColors[a]
    for (const idx of holeIdxs) {
      const hp = positions[idx]
      if (img) pieces.push({ tag: 'image', attrs: { href: img, x: hp.x - pieceSz / 2, y: hp.y - pieceSz / 2, width: pieceSz, height: pieceSz } })
      else pieces.push({ tag: 'circle', attrs: { cx: hp.x, cy: hp.y, r: pieceR - 1, fill: color, stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 1.5 } })
    }
  }
  ops.push({ op: 'elements', items: pieces })
  const labelPad = spacing * 1.0
  const labelDefs = [
    { text: 'N', x: cx, y: tips[0].y - labelPad }, { text: 'S', x: cx, y: tips[3].y + labelPad + 5 },
    { text: 'NE', x: tips[1].x + labelPad, y: tips[1].y + 4 }, { text: 'NW', x: tips[5].x - labelPad, y: tips[5].y + 4 },
    { text: 'SE', x: tips[2].x + labelPad, y: tips[2].y + 4 }, { text: 'SW', x: tips[4].x - labelPad, y: tips[4].y + 4 },
  ]
  ops.push({ op: 'group', attrs: { 'font-family': 'sans-serif', 'font-size': 10, fill: 'rgba(255,255,255,0.7)', 'font-weight': 600, 'text-anchor': 'middle' }, children: labelDefs.map(l => ({ tag: 'text', attrs: { x: l.x, y: l.y }, text: l.text })) })
  return { type: 'graph', config: { ops, width: boardW, height: boardH } }
}

// --- Cell fill strategies ---

function buildCellFill(cellColor, colors) {
  if (!cellColor || cellColor === 'none') return null

  const light = colors['cell-light'] || '#f0d9b5'
  const dark = colors['cell-dark'] || '#b58863'

  if (cellColor === 'checkered') {
    return (r, c) => (r + c) % 2 === 0 ? light : dark
  }

  if (cellColor === 'uniform') {
    return () => light
  }

  return null
}

function buildHexCellFill(cellColor, colors) {
  const light = colors['cell-light'] || '#e8e8e8'
  const dark = colors['cell-dark'] || '#c0c0c0'
  const mid = colors['cell-mid'] || '#d8d8d8'

  if (cellColor === 'tricolor') {
    return (q, r) => {
      const mod = (((q - r) % 3) + 3) % 3
      return mod === 0 ? light : mod === 1 ? mid : dark
    }
  }

  if (cellColor === 'bicolor') {
    return (q, r) => {
      const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
      return ring % 2 === 0 ? dark : light
    }
  }

  if (cellColor === 'uniform' || !cellColor) {
    return () => light
  }

  return () => light
}

// --- Hex shape parameters ---

function hexParams(topo) {
  if (topo.shape === 'hexagonal') return { radius: topo.radius || 5 }
  if (topo.shape === 'rhombus') return { rows: topo.rows || 11, cols: topo.cols || 11 }
  if (topo.shape === 'triangular') return { sideLength: topo.sideLength || 12 }
  if (topo.shape === 'irregular') return { ranks: topo.ranks || [] }
  return { radius: topo.radius || 5 }
}

// --- Decoration producers ---

function produceZones(zonesSpec, colors) {
  if (!zonesSpec) return []
  if (!Array.isArray(zonesSpec)) return []
  return zonesSpec.map(z => ({
    fromRow: z.rows?.[0] ?? 0,
    toRow: z.rows?.[1] ?? 0,
    fromCol: z.cols?.[0] ?? 0,
    toCol: z.cols?.[1] ?? 0,
    fill: colors[z.type] || colors[z.color] || z.fill || 'rgba(0,0,0,0.1)',
  }))
}

function produceDecorations(decorations, colors, rows, cols, cellSize) {
  if (!decorations || !Array.isArray(decorations)) return null
  const tintDecs = decorations.filter(d => d.type === 'tint')
  if (!tintDecs.length) return null

  const regionMap = new Map()
  for (const d of tintDecs) {
    if (d.region) {
      const rStart = d.region.rows?.[0] ?? 0
      const rEnd = d.region.rows?.[1] ?? rows - 1
      const cStart = d.region.cols?.[0] ?? 0
      const cEnd = d.region.cols?.[1] ?? cols - 1
      const fill = colors[d.color] || d.fill || 'rgba(255,200,0,0.15)'
      for (let r = rStart; r <= rEnd; r++) {
        for (let c = cStart; c <= cEnd; c++) {
          regionMap.set(`${r},${c}`, fill)
        }
      }
    }
  }

  if (!regionMap.size) return null
  return (r, c, cx, cy, ts) => {
    const fill = regionMap.get(`${r},${c}`)
    if (!fill) return null
    return [{ tag: 'rect', attrs: { x: cx - ts / 2, y: cy - ts / 2, width: ts, height: ts, fill, opacity: 0.3 } }]
  }
}

function produceDiagonals(decorations, colors) {
  if (!decorations || !Array.isArray(decorations)) return null
  const diagDec = decorations.find(d => d.type === 'diagonals')
  if (!diagDec) return null

  if (diagDec.region) {
    const rStart = diagDec.region.rows?.[0] ?? 0
    const rEnd = diagDec.region.rows?.[1] ?? 999
    const cStart = diagDec.region.cols?.[0] ?? 0
    const cEnd = diagDec.region.cols?.[1] ?? 999
    return {
      predicate: (r, c) => r >= rStart && r < rEnd && c >= cStart && c < cEnd,
      color: colors.stroke || '#333',
      width: 1.5,
    }
  }

  return null
}

function produceMarkers(decorations, topo) {
  if (!decorations || !Array.isArray(decorations)) return []
  const markerDecs = decorations.filter(d => d.type === 'markers')
  const result = []

  for (const dec of markerDecs) {
    if (dec.at) {
      for (const pos of dec.at) {
        result.push({ r: pos[0], c: pos[1], radius: dec.size || 3 })
      }
    } else if (dec.auto === 'star-points') {
      const rows = topo.rows || 19
      const cols = topo.cols || 19
      result.push(...computeStarPoints(rows, cols).map(p => ({ r: p[0], c: p[1], radius: dec.size || 3 })))
    }
  }

  return result
}

function producePaths(decorations, topo, cellSize) {
  if (!decorations || !Array.isArray(decorations)) return []
  const result = []

  for (const dec of decorations) {
    if (dec.type === 'gap') {
      // River gap — visual only, handled by grid lines skipRows
      continue
    }
    if (dec.type === 'arcs') {
      // Surakarta arcs — generated from ring count + corner offset
      result.push(...generateArcPaths(topo, dec, cellSize))
    }
  }

  return result
}

function computeStarPoints(rows, cols) {
  if (rows !== cols) return []
  const n = rows
  if (n === 9) return [[2,2],[2,6],[4,4],[6,2],[6,6]]
  if (n === 13) return [[3,3],[3,6],[3,9],[6,3],[6,6],[6,9],[9,3],[9,6],[9,9]]
  if (n === 19) return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]]
  return []
}

function generateArcPaths(topo, dec, cellSize) {
  const rows = topo.rows || 6
  const cols = topo.cols || 6
  const rings = dec.rings || 2
  const offset = dec.cornerOffset || 2
  const paths = []

  for (let ring = 1; ring <= rings; ring++) {
    const inset = (offset - ring + 1) * cellSize
    const radius = ring * cellSize

    const corners = [
      { cx: inset, cy: inset },
      { cx: (cols - 1) * cellSize - inset + cellSize, cy: inset },
      { cx: (cols - 1) * cellSize - inset + cellSize, cy: (rows - 1) * cellSize - inset + cellSize },
      { cx: inset, cy: (rows - 1) * cellSize - inset + cellSize },
    ]

    for (const corner of corners) {
      const d = `M ${corner.cx - radius} ${corner.cy} A ${radius} ${radius} 0 0 1 ${corner.cx} ${corner.cy - radius}`
      paths.push({ d, stroke: '#8b6914', strokeWidth: 2, fill: 'none', linecap: 'round' })
    }
  }

  return paths
}
