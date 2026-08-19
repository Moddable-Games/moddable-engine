// Browser consumers: js/boards.js (via schema loader), js/play.js, packages/render/src/render-engine.js
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
import { triangularPointOps } from './produce-layout-triangular-points.js'
import { landlordsOps } from './produce-layout-landlords.js'
import { produceStarLayout } from './produce-layout-star.js'

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
    case 'tableau': return produceTableauLayout(topo, colors, render, engine)
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
    texts: produceTexts(render.decorations, topo, cellSize, colors, inset, isIntersection ? (cols - 1) * cellSize : cols * cellSize, inset, render),
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

  // Append decoration ops from render.decorations (markers, tints, arcs, paths)
  if (render.decorations && render.decorations.length > 0) {
    const cellDecs = produceDecorations(render.decorations, colors, rows, cols, cellSize)
    if (cellDecs) ops.push({ op: 'cell-decorations', fn: cellDecs })
    const diags = produceDiagonals(render.decorations, colors)
    if (diags) ops.push({ op: 'diagonals', predicate: diags.predicate, forward: diags.forward, backward: diags.backward, color: diags.color || colors.stroke || '#333', width: diags.width || 1.5 })
    const topo = { rows, cols, layout: isIntersection ? 'intersections' : 'cells' }
    const paths = producePaths(render.decorations, topo, cellSize)
    for (const p of paths) ops.push({ op: 'element', tag: 'path', attrs: { d: p.d, fill: p.fill || 'none', stroke: p.stroke, 'stroke-width': p.strokeWidth || 2.5, 'stroke-linecap': p.linecap || 'round' } })
    const markers = produceMarkers(render.decorations, topo)
    if (markers.length) {
      const markerFill = render.decorations.find(d => d.type === 'markers')?.fill
      ops.push({ op: 'markers', items: markers, radius: 3, itemFill: (markerFill && colors[markerFill]) || colors.stroke || '#333' })
    }
    const textItems = produceTexts(render.decorations, topo, cellSize, colors, gx, gridW, gy, render)
    if (textItems.length) ops.push({ op: 'texts', items: textItems })
  }

  const goStyle = idStyle === 'go'
  const labelAlphabet = render.labelAlphabet ? render.labelAlphabet.slice(0, cols) : null
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
      color: goStyle ? (colors['label-text'] || '#5a4020') : (colors['label-text'] || '#5c3a1e'),
      fontSize: fs,
      fontFamily: goStyle ? 'sans-serif' : 'monospace',
      alphabet: labelAlphabet,
      offsetBaseline: true,
    } : null,
  }

  return { type: 'grid', rows, cols, config }
}


function buildOpsCellMap(zones, rows, cols, defaultFill) {
  if (zones && zones.generator === 'cross') return buildCrossMap(rows, cols, zones.castles || [], zones.armHalf)
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
  if (zones.map) {
    const lines = zones.map.trim().split('\n')
    for (let r = 0; r < lines.length && r < rows; r++) {
      for (let c = 0; c < lines[r].length && c < cols; c++) {
        if (lines[r][c] !== '.') map[r][c] = lines[r][c]
      }
    }
  }
  return map
}


function calculateStarPoints(size) {
  if (size < 9) return []
  const offset = size <= 9 ? 2 : 3
  const mid = Math.floor(size / 2)
  const last = size - 1 - offset
  const points = []
  // Corners
  points.push([offset, offset], [offset, last], [last, offset], [last, last])
  // Center (tengen)
  if (size % 2 === 1) points.push([mid, mid])
  // Edge midpoints for boards 13x13+
  if (size >= 13 && size % 2 === 1) {
    points.push([offset, mid], [mid, offset], [mid, last], [last, mid])
  }
  return points
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
      if (items === 'auto-star-points') items = calculateStarPoints(rows)
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
    case 'lines': {
      let segments = decl.segments || []
      if (decl.derive === 'palace-diagonals' && decl.regions) {
        segments = decl.regions.flatMap(region => {
          const r0 = region.rows[0], r1 = region.rows[1]
          const c0 = region.cols[0], c1 = region.cols[1]
          return [
            { from: { row: r0, col: c0 }, to: { row: r1, col: c1 } },
            { from: { row: r0, col: c1 }, to: { row: r1, col: c0 } },
          ]
        })
      }
      const lineColor = colors[decl.color] || decl.color || colors.stroke || '#333'
      const lineWidth = decl.width || 2
      const children = segments.map(seg => ({
        tag: 'line',
        attrs: {
          x1: gx + seg.from.col * cellSize,
          y1: gy + seg.from.row * cellSize,
          x2: gx + seg.to.col * cellSize,
          y2: gy + seg.to.row * cellSize,
          stroke: lineColor,
          'stroke-width': lineWidth,
        },
      }))
      return { op: 'group', attrs: {}, children }
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
        children = orbitArcElements(gx, gy, cellSize, rows, cols, colors, decl.rings || 2)
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
          const voidFill = colors['void-fill'] || 'transparent'
          return {
            op: 'cells',
            interactive: true,
            idStyle,
            _prefixRect: { op: 'rect', attrs: { x: ox, y: oy, width: cols * cellSize, height: rows * cellSize, fill: voidFill } },
            fill(r, c) {
              const cell = cellMap[r] && cellMap[r][c]
              if (!cell) return null
              const fill = (typeof cell === 'string' && colors[cell]) ? colors[cell] : (r + c) % 2 === 0 ? light : dark
              const stroke = (typeof cell === 'string' && colors[cell + '-stroke']) ? colors[cell + '-stroke'] : null
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
                const xStroke = colors['castle-x'] || '#fff8f0'
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
        const map = buildCrossMap(rows, cols, decl.castles || [], decl.armHalf)
        const typeColors = {}
        const typeStrokes = {}
        if (decl.typeColors) for (const [t, v] of Object.entries(decl.typeColors)) typeColors[t] = colors[v] || v
        if (decl.typeStrokes) for (const [t, v] of Object.entries(decl.typeStrokes)) typeStrokes[t] = colors[v] || v
        const decorationDefs = decl.decorations || {}
        const result = { op: 'cells', interactive: true, idStyle }
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
        const result = { op: 'cells', interactive: true, idStyle }
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

function orbitArcElements(gx, gy, tileSize, rows, cols, colors, rings = 2) {
  const ix = (i) => gx + i * tileSize
  const iy = (i) => gy + i * tileSize
  const result = []
  for (let ring = 1; ring <= rings; ring++) {
    const radius = tileSize * ring
    const colorKey = ring === 1 ? 'inner-arc' : ring === 2 ? 'outer-arc' : `arc-${ring}`
    const stroke = colors[colorKey] || '#6b4a30'
    result.push(
      { tag: 'path', attrs: { d: `M ${ix(ring)},${iy(0)} A ${radius},${radius} 0 1,0 ${ix(0)},${iy(ring)}`, stroke } },
      { tag: 'path', attrs: { d: `M ${ix(cols - 1 - ring)},${iy(0)} A ${radius},${radius} 0 1,1 ${ix(cols - 1)},${iy(ring)}`, stroke } },
      { tag: 'path', attrs: { d: `M ${ix(0)},${iy(rows - 1 - ring)} A ${radius},${radius} 0 1,0 ${ix(ring)},${iy(rows - 1)}`, stroke } },
      { tag: 'path', attrs: { d: `M ${ix(cols - 1)},${iy(rows - 1 - ring)} A ${radius},${radius} 0 1,1 ${ix(cols - 1 - ring)},${iy(rows - 1)}`, stroke } }
    )
  }
  return result
}


function tricolorFn(hex, colors) {
  const mod = (((hex.q - hex.r) % 3) + 3) % 3
  const light = colors['cell-light']
  const mid = colors['cell-mid']
  const dark = colors['cell-dark']
  return mod === 0 ? light : mod === 1 ? mid : dark
}

function ringColorFn(hex, colors) {
  const ring = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.q + hex.r))
  const light = colors['cell-light']
  const dark = colors['cell-dark']
  return ring % 2 === 0 ? dark : light
}

function produceHexLayout(topo, colors, render) {
  if (render._hexes || render._hexRadius != null || (render._hexRows && render._hexCols)) return hexBoardOps(colors, render)
  return produceHexLegacy(topo, colors, render)
}

function produceHexDirect(topo, colors, render) {
  const derived = { ...render }
  if (topo.radius != null) derived._hexRadius = topo.radius
  else if (topo.rows && topo.cols) { derived._hexRows = topo.rows; derived._hexCols = topo.cols }
  else if (topo.grid) derived._hexes = topo.grid.map(c => Array.isArray(c) ? { q: c[0], r: c[1] } : c)
  if (topo.orientation === 'flat') derived._flat = true
  if (render.frame || topo.shape) derived._frame = render.frame || topo.shape
  if (render.cellColor === 'tricolor') derived._colorFn = tricolorFn
  else if (render.cellColor === 'rings') derived._colorFn = ringColorFn
  else if (render.cellColor === 'terrain') derived._hexTypes = true
  if (render.centreMarker) derived._centreMarker = render.centreMarker
  return hexBoardOps(colors, derived)
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

import { HexMath } from '../../topologies/hex/index.js'
import { buildCrossMap } from './cross-map.js'

function axialToPixelPointy(q, r, size) {
  return HexMath.axialToPixelPointy(q, r, size)
}

function axialToPixelFlat(q, r, size) {
  return HexMath.axialToPixelFlat(q, r, size)
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
  let hexColorFn = render._colorFn || null
  if (!hexColorFn && render.cellColor === 'tricolor') hexColorFn = tricolorFn
  else if (!hexColorFn && render.cellColor === 'rings') hexColorFn = ringColorFn
  const hexTypes = render._hexTypes || (render.cellColor === 'terrain')
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
    const borderColor = colors.border
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
      const light = colors['cell-light']
      const dark = colors['cell-dark']
      const mid = colors['cell-mid']
      fill = s % 3 === 0 ? light : s % 3 === 1 ? dark : mid
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
  const derived = { ...render }
  if (topo.radius != null) derived._hexRadius = topo.radius
  else if (topo.rows && topo.cols) { derived._hexRows = topo.rows; derived._hexCols = topo.cols }
  else if (topo.grid) derived._hexes = topo.grid.map(c => Array.isArray(c) ? { q: c[0], r: c[1] } : c)
  else derived._hexRadius = 5
  if (topo.orientation === 'flat') derived._flat = true
  if (render.frame || topo.shape) derived._frame = render.frame || topo.shape
  if (render.cellColor === 'tricolor') derived._colorFn = tricolorFn
  else if (render.cellColor === 'rings') derived._colorFn = ringColorFn
  if (render.centreMarker) derived._centreMarker = render.centreMarker
  return hexBoardOps(colors, derived)
}

function produceTrackLayout(topo, colors, render) {
  const style = render.trackStyle || 'dots'
  if (style === 'triangular-points') return triangularPointOps(colors, render)
  if (style === 'perimeter') return landlordsOps(colors, render)
  return { type: 'track', config: { style, ops: [], width: 0, height: 0 } }
}


function producePitLayout(topo, colors, render) {
  return producePitOps(topo, colors, render)
}

// --- Pit ops builder ---
//
// Emits the full drawing program for renderPitLayout() from resolved
// frontmatter.
// provider — byte-identity contract (attribute order, element order).
// Colors arrive from frontmatter and are normalized to camelCase by
// produceLayout.
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
      el('circle', { cx: cx + sx, cy: cy + sy, r: seedRadius, fill: colors.seed, stroke: colors['seed-stroke'], 'stroke-width': 0.5 })
    }
  }

  const marker = (cx, cy) => {
    el('circle', { cx, cy, r: pitRadius - 8, fill: 'none', stroke: colors.marker, 'stroke-width': 2, 'stroke-dasharray': '4,3' })
  }

  const pit = (cx, cy, idx) => {
    el('circle', { cx, cy, r: pitRadius, fill: colors.pit, stroke: colors['pit-stroke'], 'stroke-width': 1.5, class: 'board-cell', 'data-sq': `pit-${idx}` })
  }

  const store = (cx, cy, sq) => {
    el('ellipse', { cx, cy, rx: storeRx, ry: storeRy, fill: colors.pit, stroke: colors['pit-stroke'], 'stroke-width': 1.5, class: 'board-cell', 'data-sq': sq })
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

    el('ellipse', { cx, cy, rx: outerRx, ry: outerRy, fill: colors['board-outer'] })
    el('ellipse', { cx, cy, rx: outerRx - 8, ry: outerRy - 8, fill: colors['board-inner'] })

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

  el('rect', { x: bx, y: by, width: bw, height: bh, rx, ry: rx, fill: colors['board-outer'] })
  el('rect', { x: bx + 6, y: by + 6, width: bw - 12, height: bh - 12, rx: rx - 4, ry: rx - 4, fill: colors['board-inner'] })
  if (colors.border) {
    const attrs = { x: bx + 12, y: by + 12, width: bw - 24, height: bh - 24, rx: rx - 8, ry: rx - 8, fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }
    if (colors['border-dash']) attrs['stroke-dasharray'] = colors['border-dash']
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
    el('line', { x1: pitsLeftEdge - pitRadius, y1: divY, x2: pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius, y2: divY, stroke: colors['board-outer'], 'stroke-width': 2.5, 'stroke-dasharray': '6,4' })
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

function produceTableauLayout(topo, colors, render, engine) {
  const config = { ...topo, colors, render, deal: engine?.deal, components: engine?.components, meta: engine?.meta, seed: engine?.setup?.seed || 42 }
  return { type: 'tableau', config }
}

function produceGraphLayout(topo, colors, render) {
  const structure = topo.structure || 'concentric-rings'
  const params = topo.params || {}
  const size = render.canvasSize || 320
  // star sizes its holes from `spacing`, so it takes no point radius.
  const pointRadius = render.nodeRadius || (structure === 'grid-cross' ? 6 : 7)

  switch (structure) {
    case 'perimeter-cross': return { type: 'graph', config: { ops: perimeterCrossOps(size, 0, 0, colors, pointRadius, params), width: size, height: size } }
    case 'concentric-rings': return { type: 'graph', config: { ops: concentricRingOps(size, 0, 0, colors, pointRadius, params), width: size, height: size } }
    case 'grid-cross': return { type: 'graph', config: { ops: gridCrossOps(size, 0, 0, colors, pointRadius, params, render), width: size, height: size } }
    case 'star': return produceStarLayout(colors, render, params)
    default: return { type: 'graph', config: { ops: [], width: size, height: size } }
  }
}

// --- Graph structure generators + ops builders ---

// A perimeter-cross board is a square circuit with `nodesPerSide` stations per
// side, plus diagonals that run corner → centre → opposite corner with
// `intermediatesPerDiagonal` stations on each half. `sides` selects how many of
// the square's four sides are walked; the square is the structure's frame, so
// values above 4 collapse to 4 rather than inventing a polygon.
const PERIMETER_CROSS_MAX_SIDES = 4

function perimeterCrossStations(size, ox, oy, params) {
  const nodesPerSide = params.nodesPerSide || 5
  const hasDiagonals = params.diagonals !== false
  const intermediates = params.intermediatesPerDiagonal ?? 2
  const margin = size * 0.08
  const nodes = [], edges = []
  const x0 = ox + margin, x1 = ox + size - margin
  const y0 = oy + margin, y1 = oy + size - margin
  const cx = ox + size / 2, cy = oy + size / 2
  const square = [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y0 }]
  const sides = Math.min(params.sides || PERIMETER_CROSS_MAX_SIDES, PERIMETER_CROSS_MAX_SIDES)
  const corners = square.slice(0, sides)
  for (let side = 0; side < corners.length; side++) {
    const from = corners[side], to = corners[(side + 1) % corners.length]
    nodes.push(from)
    for (let i = 1; i < nodesPerSide; i++) nodes.push({ x: from.x + (to.x - from.x) * i / nodesPerSide, y: from.y + (to.y - from.y) * i / nodesPerSide })
  }
  const perimeterCount = nodes.length
  for (let i = 0; i < perimeterCount; i++) edges.push([i, (i + 1) % perimeterCount])
  const centreIdx = nodes.length
  nodes.push({ x: cx, y: cy })
  const junctions = new Set([centreIdx])
  for (let side = 0; side < corners.length; side++) junctions.add(side * nodesPerSide)

  if (hasDiagonals) {
    const half = Math.floor(corners.length / 2)
    for (let d = 0; d < half; d++) {
      const inIdx = (d + half) * nodesPerSide, outIdx = d * nodesPerSide
      const inCorner = nodes[inIdx], outCorner = nodes[outIdx]
      let prev = inIdx
      for (let i = 1; i <= intermediates; i++) {
        nodes.push({ x: inCorner.x + (cx - inCorner.x) * i / (intermediates + 1), y: inCorner.y + (cy - inCorner.y) * i / (intermediates + 1) })
        edges.push([prev, nodes.length - 1])
        prev = nodes.length - 1
      }
      edges.push([prev, centreIdx])
      prev = centreIdx
      for (let i = 1; i <= intermediates; i++) {
        nodes.push({ x: cx + (outCorner.x - cx) * i / (intermediates + 1), y: cy + (outCorner.y - cy) * i / (intermediates + 1) })
        edges.push([prev, nodes.length - 1])
        prev = nodes.length - 1
      }
      edges.push([prev, outIdx])
    }
  }
  return { nodes, edges, junctions, centreIdx }
}

function perimeterCrossOps(size, ox, oy, colors, pointRadius, params) {
  const { nodes, edges, junctions, centreIdx } = perimeterCrossStations(size, ox, oy, params)
  const dotR = (i) => i === centreIdx ? pointRadius * 1.4 : junctions.has(i) ? pointRadius * 1.2 : pointRadius
  return [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'edges', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, nodes, pairs: edges },
    { op: 'nodes', group: {}, items: nodes,
      dot: { radius: (n, i) => dotR(i), fill: (n, i) => i === centreIdx ? colors.centre : junctions.has(i) ? colors.junction : colors.point },
      hit: { radius: (n, i) => dotR(i) * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
  ]
}

function concentricRingRects(rings, size, ox, oy) {
  const rects = []
  const margin = size * 0.0625, maxInset = size * 0.375
  const step = rings > 1 ? (maxInset - margin) / (rings - 1) : 0
  for (let i = 0; i < rings; i++) {
    const inset = margin + i * step
    rects.push({ x: ox + inset, y: oy + inset, w: size - inset * 2, h: size - inset * 2 })
  }
  return rects
}

function concentricRingPoints(ringRects, midpoints, cx, cy, rings) {
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

function concentricRingOps(size, ox, oy, colors, pointRadius, params) {
  const rings = params.rings || 3
  const diagonals = params.diagonals || false
  const midpoints = params.midpoints !== false
  const cx = ox + size / 2, cy = oy + size / 2
  const ringRects = concentricRingRects(rings, size, ox, oy)
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
  const points = concentricRingPoints(ringRects, midpoints, cx, cy, rings)
  return [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'group', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'square' }, children: structure },
    { op: 'nodes', group: { fill: colors.point }, items: points,
      dot: { radius: pointRadius },
      hit: { radius: pointRadius * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
  ]
}

// Default grid-cross frame (alquerque cross) when no `rows` are declared.
const DEFAULT_GRID_CROSS = {
  rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]],
  fortressRows: 2, fortressExtraRow: 2, fortressCols: [2,3,4],
}

function gridCrossNodes(size, ox, oy, gridDef) {
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

function gridCrossFortressElements(nodes, fortressNodes, nodeMap, gridDef, colors) {
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
  parts.push({ tag: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: colors['fortress-border'], 'stroke-width': 2 } })
  return parts
}

function gridCrossOps(size, ox, oy, colors, pointRadius, params, render) {
  const gridDef = params.rows ? params : DEFAULT_GRID_CROSS
  const { nodes, edges, fortressNodes, nodeMap } = gridCrossNodes(size, ox, oy, gridDef)
  const ops = [
    { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
    { op: 'elements', items: gridCrossFortressElements(nodes, fortressNodes, nodeMap, gridDef, colors) },
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
      if (rows === cols) result.push(...calculateStarPoints(rows).map(p => ({ r: p[0], c: p[1], radius: dec.size || 3 })))
    }
  }

  return result
}

function resolveGapBand(decorations, render, topo) {
  const rows = topo?.rows || 0
  const split = (render?.ops || []).find(o => o.op === 'grid-lines' && o.split)?.split
  const gapDec = (decorations || []).find(d => d.type === 'gap')

  let band = null
  if (split && split.topRow != null && split.bottomRow != null) band = [split.topRow, split.bottomRow]
  else if (gapDec && !render?.ops) band = Array.isArray(gapDec.rows) ? gapDec.rows : [Math.ceil(rows / 2) - 1, Math.ceil(rows / 2)]
  if (!band) return null

  const [rt, rb] = band
  if (!Number.isFinite(rt) || rb !== rt + 1 || rt < 1 || rb > rows - 2) return null
  return [rt, rb]
}

function produceTexts(decorations, topo, cellSize, colors, gx, gridW, gy, render) {
  if (!decorations || !Array.isArray(decorations)) return []
  const textDecs = decorations.filter(d => d.type === 'texts')
  if (!textDecs.length) return []

  const band = resolveGapBand(decorations, render, topo)
  const isIntersection = topo?.layout === 'intersections' || topo?.layout === 'cross'

  const items = []
  for (const dec of textDecs) {
    if (!dec.items) continue
    for (const item of dec.items) {
      if (item.position && band) {
        const [rt, rb] = band
        const rmid = (gy || 0) + ((rt + rb) / 2 + (isIntersection ? 0 : 0.5)) * cellSize
        const fs = Math.min(cellSize * 0.45, 14)
        const fill = (item.fill && colors[item.fill]) || colors.stroke || '#4a3520'
        const xFrac = item.position === 'river-left' ? 0.25 : 0.75
        items.push({
          attrs: { x: gx + gridW * xFrac, y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill },
          text: item.text,
        })
      } else if (item.attrs) {
        items.push({ attrs: { ...item.attrs, fill: (colors[item.attrs?.fill] || item.attrs?.fill) }, text: item.text })
      }
    }
  }
  return items
}

function producePaths(decorations, topo, cellSize) {
  if (!decorations || !Array.isArray(decorations)) return []
  const result = []

  for (const dec of decorations) {
    if (dec.type === 'gap') {
      continue
    }
    if (dec.type === 'arcs') {
      result.push(...generateArcPaths(topo, dec, cellSize))
    }
  }

  return result
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
