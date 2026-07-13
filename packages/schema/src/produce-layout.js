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

  const ops = render.ops.map(decl => translateOp(decl, { rows, cols, cellSize, colors, inset, gridW, gridH, boardW, boardH, ox, oy, gx, gy, idStyle }))

  const config = {
    tileSize: cellSize,
    positionType,
    inset,
    origin: { x: ox, y: oy },
    size: { width: boardW + pad * 2, height: boardH + pad * 2 },
    ops,
    labels: showLabels ? {
      show: true,
      color: colors.labelText || colors.stroke || '#555',
      fontSize: 10,
      fontFamily: 'monospace',
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
        Object.assign(attrs, { x: decl.x ?? ox, y: decl.y ?? oy, width: decl.width ?? boardW, height: decl.height ?? boardH })
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
      const attrs = { ...(decl.attrs || {}) }
      if (decl.stroke) attrs.stroke = colors[decl.stroke] || decl.stroke
      if (decl['stroke-width'] != null) attrs['stroke-width'] = decl['stroke-width']
      if (decl['stroke-dasharray']) attrs['stroke-dasharray'] = decl['stroke-dasharray']
      if (decl.fill) attrs.fill = colors[decl.fill] || decl.fill
      if (decl['stroke-linecap']) attrs['stroke-linecap'] = decl['stroke-linecap']
      return { op: 'group', attrs, children }
    }
    case 'cells': {
      if (decl.pattern === 'checkered') {
        const light = colors[decl.light] || decl.light
        const dark = colors[decl.dark] || decl.dark
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

// Legacy dispatch kept below — remove once all families use render.ops
const GRID_STYLE_INSETS = {
  checkered: () => 0,
  'mono-grid': () => 0,
  go: () => 15,
  surakarta: (ts) => Math.round(ts * 2.3),
  xiangqi: () => 20,
  shogi: () => 20,
  alquerque: (ts) => Math.round(ts * 0.5),
}

const GRID_STYLE_OPS = {
  checkered({ rows, cols, cellSize, colors, render }) {
    const light = colors.lightSquare || colors['cell-light'] || '#f0d9b5'
    const dark = colors.darkSquare || colors['cell-dark'] || '#b58863'
    return [
      { op: 'cells', interactive: true, fill: (r, c) => (r + c) % 2 === 0 ? light : dark },
    ]
  },

  'mono-grid'({ rows, cols, cellSize, colors, ox, oy }) {
    const fill = colors.monoSquare || colors['cell-light'] || '#d9b483'
    const line = colors.gridLine || colors.stroke || '#8b6914'
    return [
      { op: 'rect', attrs: { x: ox, y: oy, width: cols * cellSize, height: rows * cellSize, fill } },
      { op: 'grid-lines', grouped: false, order: 'vh', color: line, width: 1.5 },
      { op: 'hit-targets', shape: 'rect', idStyle: 'algebraic' },
    ]
  },

  go({ rows, cols, cellSize, colors, inset, gridW, gridH, ox, oy, gx, gy, render, topo }) {
    const starPoints = produceStarPointsFromDecorations(render.decorations, rows)
    return [
      { op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.woodLight || '#dcb35c' } },
      { op: 'rect', attrs: { x: gx, y: gy, width: gridW, height: gridH, fill: colors.woodDark || '#d4a843', rx: 2 } },
      { op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine || '#3d2b1a', width: 0.8 },
      { op: 'markers', grouped: true, groupFill: colors.starPoint || '#3d2b1a', items: starPoints, radius: 3 },
      { op: 'hit-targets', grouped: true, radius: cellSize * 0.45, idStyle: 'go' },
    ]
  },

  shogi({ rows, cols, cellSize, colors, inset, gridW, gridH, ox, oy, gx, gy, render }) {
    const hoshi = produceMarkerPositions(render.decorations)
    const ops = []
    ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.board || '#e8c97a' } })
    ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: 'none', stroke: colors.boardBorder || '#8b6914', 'stroke-width': 2 } })
    if (rows === 9) {
      ops.push({ op: 'rect', attrs: { x: gx, y: gy, width: gridW, height: 2 * cellSize, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' } })
      ops.push({ op: 'rect', attrs: { x: gx, y: gy + 6 * cellSize, width: gridW, height: 2 * cellSize, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' } })
    }
    ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine || '#6b4e1a', width: 0.8 })
    ops.push({ op: 'markers', grouped: true, groupFill: colors.hoshi || '#6b4e1a', items: hoshi, radius: 3 })
    ops.push({ op: 'hit-targets', grouped: true, radius: cellSize * 0.4, idStyle: 'algebraic' })
    return ops
  },

  xiangqi({ rows, cols, cellSize, colors, inset, gridW, gridH, ox, oy, gx, gy, render }) {
    const river = render.river === true
    const ops = []
    ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.board || '#f5deb3' } })
    ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: 'none', stroke: colors.gridLine || '#4a3520', 'stroke-width': 2 } })
    if (river) {
      const rt = render.decorations?.find(d => d.type === 'gap')?.rows?.[0] ?? Math.floor(rows / 2) - 1
      const rb = render.decorations?.find(d => d.type === 'gap')?.rows?.[1] ?? Math.floor(rows / 2)
      ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine || '#4a3520', width: 1, skipRows: [rt, rb], appendRows: [rt, rb], split: { topRow: rt, bottomRow: rb, edgeCols: [0, cols - 1] } })
    } else {
      ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine || '#4a3520', width: 1 })
    }
    if (render.palace !== false) {
      const mid = Math.floor(cols / 2)
      const palaceLeft = mid - 1, palaceRight = mid + 1, palaceRows = 2
      const pl = gx + palaceLeft * cellSize, pr = gx + palaceRight * cellSize
      const children = [
        { tag: 'line', attrs: { x1: pl, y1: gy, x2: pr, y2: gy + palaceRows * cellSize } },
        { tag: 'line', attrs: { x1: pr, y1: gy, x2: pl, y2: gy + palaceRows * cellSize } },
        { tag: 'line', attrs: { x1: pl, y1: gy + (rows - 1 - palaceRows) * cellSize, x2: pr, y2: gy + (rows - 1) * cellSize } },
        { tag: 'line', attrs: { x1: pr, y1: gy + (rows - 1 - palaceRows) * cellSize, x2: pl, y2: gy + (rows - 1) * cellSize } },
      ]
      ops.push({ op: 'group', attrs: { stroke: colors.palace || '#4a3520', 'stroke-width': 0.8, 'stroke-dasharray': '4,3' }, children })
    }
    if (river) {
      const rt = render.decorations?.find(d => d.type === 'gap')?.rows?.[0] ?? Math.floor(rows / 2) - 1
      const rb = render.decorations?.find(d => d.type === 'gap')?.rows?.[1] ?? Math.floor(rows / 2)
      const rty1 = gy + rt * cellSize, rty2 = gy + rb * cellSize
      const rmid = (rty1 + rty2) / 2
      const fs = Math.min(cellSize * 0.45, 14)
      ops.push({ op: 'texts', items: [
        { attrs: { x: gx + gridW * 0.25, y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill: colors.riverText || '#4a3520' }, text: '楚 河' },
        { attrs: { x: gx + gridW * 0.75, y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill: colors.riverText || '#4a3520' }, text: '漢 界' },
      ] })
    }
    ops.push({ op: 'hit-targets', grouped: true, radius: cellSize * 0.4, idStyle: 'algebraic' })
    return ops
  },

  surakarta({ rows, cols, cellSize, colors, inset, gridW, gridH, ox, oy, gx, gy, render }) {
    const boardW = gridW + inset * 2, boardH = gridH + inset * 2
    const arcs = surakartaArcElements(gx, gy, cellSize, rows, cols, colors)
    return [
      { op: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, rx: 8, fill: colors.frame || '#5a3e28' } },
      { op: 'rect', attrs: { x: ox + 6, y: oy + 6, width: boardW - 12, height: boardH - 12, rx: 5, fill: colors.board || '#c8a872' } },
      { op: 'rect', attrs: { x: ox + 10, y: oy + 10, width: boardW - 20, height: boardH - 20, rx: 3, fill: colors.boardInner || '#d4b896' } },
      { op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine || '#6b4a30', width: 1.5 },
      { op: 'group', attrs: { fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, children: arcs },
      { op: 'markers', grouped: true, groupFill: colors.dotFill || '#4a3320', allCells: true, radius: 3.5 },
      { op: 'hit-targets', grouped: true, radius: cellSize * 0.45, idStyle: 'go' },
    ]
  },

  alquerque({ rows, cols, cellSize, colors, inset, gridW, gridH, ox, oy }) {
    return [
      { op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.monoSquare || '#d9b483', rx: 4 } },
      { op: 'grid-lines', grouped: false, order: 'hv', color: colors.gridLine || '#8b6914', width: 2 },
      { op: 'diagonals', predicate: (r, c) => (r + c) % 2 === 0, color: colors.gridLine || '#8b6914', width: 1.5 },
      { op: 'markers', allCells: true, radius: 3, itemFill: colors.gridLine || '#8b6914', hits: { radius: cellSize * 0.4, idStyle: 'algebraic' } },
    ]
  },
}

function produceStarPointsFromDecorations(decorations, rows) {
  if (!decorations || !Array.isArray(decorations)) return STUDIO_STAR_POINTS[rows] || []
  const markerDec = decorations.find(d => d.type === 'markers')
  if (!markerDec) return STUDIO_STAR_POINTS[rows] || []
  if (markerDec.at) return markerDec.at
  if (markerDec.auto === 'star-points') return STUDIO_STAR_POINTS[rows] || []
  return []
}

function produceMarkerPositions(decorations) {
  if (!decorations || !Array.isArray(decorations)) return []
  const markerDec = decorations.find(d => d.type === 'markers')
  if (!markerDec) return []
  if (markerDec.at) return markerDec.at
  return []
}

const STUDIO_STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,9],[6,6],[9,3],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
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

  if (style === 'triangular-points') {
    return {
      type: 'track',
      config: {
        style: 'points',
        colors: {
          frame: colors.background || '#3a2a1a',
          felt: colors['cell-light'] || '#2e7d32',
          pointA: colors['cell-light'] || '#c8a43c',
          pointB: colors['cell-dark'] || '#8b2240',
        },
        frameW: 16,
        barW: 24,
        pointW: 32,
        boardH: 320,
        pieceSize: 22,
        pieceSpacing: 22,
        maxStack: 5,
      },
    }
  }

  if (style === 'perimeter') {
    return {
      type: 'track',
      config: {
        style: 'perimeter',
        totalSpaces: topo.positions || 40,
        corners: 4,
        spaceW: 56,
        cornerSize: 80,
        colors: {
          board: colors['cell-light'] || '#f5f0e8',
          border: colors.stroke || '#8b7355',
          corner: colors['cell-dark'] || '#c4b088',
          cornerStroke: colors.stroke || '#8b7355',
          spaceStroke: colors.stroke || '#8b7355',
          text: colors.stroke || '#333',
        },
      },
    }
  }

  return { type: 'track', config: { style } }
}

function producePitLayout(topo, colors, render) {
  const cols = topo.cols || 6
  const rows = topo.rows || 2
  const stores = topo.stores !== false

  return {
    type: 'pit',
    config: {
      colors: {
        boardOuter: colors['board-outer'] || colors['cell-dark'] || '#7A5A32',
        boardInner: colors['board-inner'] || colors['cell-light'] || '#9B7740',
        border: colors.stroke || '#3A2515',
        pit: colors.pit || colors.background || '#4E3320',
        pitStroke: colors['pit-stroke'] || colors.stroke || '#3A2515',
        seed: colors.seed || '#C8B898',
        seedStroke: colors['seed-stroke'] || '#8A7A5A',
      },
      pitRadius: render.pitRadius || 22,
      storeRx: render.storeSize?.[0] || 24,
      storeRy: render.storeSize?.[1] || 50,
      cornerRadius: render.cornerRadius || 22,
      boardRows: rows,
      seedsPerPit: 4,
      markers: render.markers || [],
    },
    cols,
    stores,
  }
}

function produceGraphLayout(topo, colors, render) {
  const nodeRadius = render.nodeRadius || 7

  const config = {
    width: 320,
    height: 320,
    backgrounds: [{ fill: colors.background || '#f5f5f5', rx: 8 }],
    edgeStyle: { stroke: colors.stroke || '#333', strokeWidth: 2.5, linecap: 'round' },
    nodeRadius,
    nodeColor: colors.stroke || '#333',
    nodeScale: {},
    nodeColorMap: {},
    defs: [],
  }

  if (topo.structure) {
    config.structure = topo.structure
    config.params = topo.params || {}
  } else if (topo.nodes && topo.edges) {
    config.nodes = topo.nodes
    config.edges = topo.edges
  }

  return { type: 'graph', config }
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
