/**
 * Graph board style configs — the bridge between board styles and the single
 * graph render pipeline (#18). Same pattern as grid-board-styles.js.
 *
 * ALL game data lives here as declared config: nyout station layout, morris
 * ring geometry, asalto cross-grid + fortress shapes, stern-halma star
 * polygons and arm colours. The structure generators are data factories —
 * per consolidation-plan.md they belong at the config layer, NOT in the
 * topology package. renderGraphLayout() only ever sees parametric ops.
 *
 * Every entry documents what frontmatter must eventually carry; when
 * produce() emits these ops from YAML, this file shrinks to nothing.
 *
 * Byte-identity contract: each style's ops reproduce the historical provider
 * output exactly (attribute order, grouping, element order). Verified by
 * scripts/snapshot-boards.mjs --diff.
 */

import { renderGraphLayout } from '../../topology-graph/src/topology-graph.js'
import { elementsToFragment } from './serialize-layout.js'

// ─── Structure generators (data factories → frontmatter params) ─────────────

// Nyout: 20 perimeter stations + centre + 8 diagonal intermediates
// (frontmatter: topology.structure perimeter-cross params)
function nyoutStations(size, ox, oy) {
  const margin = size * 0.08
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

// Morris: concentric ring rects (frontmatter: topology.structure concentric-rings)
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

// Asalto: cross-grid with fortress (frontmatter: topology.structure grid-cross params)
const DEFAULT_ASALTO_GRID = {
  rows: [
    [2, 3, 4],
    [2, 3, 4],
    [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
    [0, 1, 2, 3, 4, 5, 6],
    [2, 3, 4],
    [2, 3, 4],
  ],
  fortressRows: 2,
  fortressExtraRow: 2,
  fortressCols: [2, 3, 4],
}

function asaltoNodes(size, ox, oy, opts) {
  const nodes = []
  const edges = []
  const fortressNodes = new Set()

  const gridDef = opts.asaltoGrid || DEFAULT_ASALTO_GRID
  const rowDefs = gridDef.rows.map((cols, y) => ({ cols, y }))
  const fortressRowCount = gridDef.fortressRows || 2

  const maxCol = Math.max(...rowDefs.flatMap(r => r.cols))
  const maxRow = rowDefs.length - 1
  const margin = size * 0.08
  const usable = size - margin * 2
  const hGaps = maxCol
  const vGaps = maxRow
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
      if (row.cols[i + 1] - row.cols[i] === 1) {
        edges.push([nodeMap[`${row.y},${row.cols[i]}`], nodeMap[`${row.y},${row.cols[i + 1]}`]])
      }
    }
  }
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) {
      if (r2.cols.includes(col)) {
        edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col}`]])
      }
    }
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
      for (const target of extra.connectsTo) {
        const tIdx = nodeMap[`${target[0]},${target[1]}`]
        if (tIdx !== undefined) edges.push([idx, tIdx])
      }
    }
  }

  return { nodes, edges, fortressNodes, nodeMap }
}

// Asalto fortress highlight elements (zone fills + border)
function asaltoFortressElements(nodes, fortressNodes, nodeMap, opts, colors) {
  const fNodes = [...fortressNodes].map(i => nodes[i])
  if (fNodes.length === 0) return []
  const parts = []
  const gridDef = opts.asaltoGrid || { rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]], fortressRows: 2 }
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
    const totalNodes = nodes.length
    const extraStart = totalNodes - gridDef.extraNodes.length
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

// Stern-halma: 17-row star hole grid + board dressing geometry
// (frontmatter: topology.structure star params + arm colour palette)
function sternLayout(opts) {
  const spacing = opts.holeSpacing || 24
  const rim = spacing * 1.2
  const margin = spacing * 2.5
  const innerW = spacing * 16 + margin * 2
  const innerH = Math.round(spacing * Math.sqrt(3) / 2 * 16) + margin * 2 + spacing
  const boardW = innerW + rim * 2
  const boardH = innerH + rim * 2
  return { boardW, boardH, innerW, innerH, rim }
}

function sternHoles(opts, ox, oy) {
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
}

// ─── The 4 style configs ────────────────────────────────────────────────────

const STYLES = {

  nyout: {
    name: 'nyout',
    positionType: 'node',
    labelStyle: 'none',
    defaultColors: { background: '#f5e6c8', line: '#4a3520', point: '#4a3520', junction: '#c0622f', centre: '#8b1a1a' },
    computeLayout(opts) {
      const size = opts.boardSize || 320
      return { boardW: size, boardH: size }
    },
    ops(ctx) {
      const { colors, opts, ox, oy } = ctx
      const size = opts.boardSize || 320
      const pointRadius = opts.pointRadius || 7
      const { nodes, edges, junctions } = nyoutStations(size, ox, oy)
      const dotR = (i) => i === 20 ? pointRadius * 1.4 : junctions.has(i) ? pointRadius * 1.2 : pointRadius
      return [
        { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
        { op: 'edges', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, nodes, pairs: edges },
        { op: 'nodes', group: {}, items: nodes,
          dot: { radius: (n, i) => dotR(i), fill: (n, i) => i === 20 ? colors.centre : junctions.has(i) ? colors.junction : colors.point },
          hit: { radius: (n, i) => dotR(i) * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
      ]
    },
  },

  morris: {
    name: 'morris',
    positionType: 'node',
    labelStyle: 'none',
    defaultColors: { background: '#f5e6c8', line: '#4a3520', point: '#4a3520' },
    computeLayout(opts) {
      const size = opts.boardSize || 320
      return { boardW: size, boardH: size }
    },
    ops(ctx) {
      const { colors, opts, ox, oy } = ctx
      const size = opts.boardSize || 320
      const rings = opts.rings || 3
      const diagonals = opts.diagonals || false
      const midpoints = opts.midpoints !== false
      const pointRadius = opts.pointRadius || 7
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
    },
  },

  asalto: {
    name: 'asalto',
    positionType: 'node',
    labelStyle: 'none',
    defaultColors: { background: '#f5e6c8', line: '#2a2a2a', point: '#2a2a2a', fortress: 'rgba(40,80,180,0.15)', fortressBorder: '#3355aa' },
    computeLayout(opts) {
      const size = opts.boardSize || 320
      return { boardW: size, boardH: size }
    },
    ops(ctx) {
      const { colors, opts, ox, oy } = ctx
      const size = opts.boardSize || 320
      const pointRadius = opts.pointRadius || 6
      const { nodes, edges, fortressNodes, nodeMap } = asaltoNodes(size, ox, oy, opts)

      const ops = [
        { op: 'rect', attrs: { x: ox, y: oy, width: size, height: size, fill: colors.background, rx: 4 } },
        { op: 'elements', items: asaltoFortressElements(nodes, fortressNodes, nodeMap, opts, colors) },
        { op: 'edges', attrs: { fill: 'none', stroke: colors.line, 'stroke-width': 2, 'stroke-linecap': 'round' }, nodes, pairs: edges },
        { op: 'nodes', group: { fill: colors.point }, items: nodes,
          dot: { radius: pointRadius, fill: colors.point },
          hit: { radius: pointRadius * 2, id: (n, i) => `n${i + 1}`, dataType: 'node' } },
      ]

      // Setup pieces at nodes (position map → gallery images or coloured discs)
      const position = opts.position || {}
      const pieceImages = opts.pieceImages || {}
      const pieceSize = pointRadius * 3.5
      const pieces = []
      for (let i = 0; i < nodes.length; i++) {
        const sq = `n${i + 1}`
        const piece = position[sq]
        if (!piece) continue
        const p = typeof piece === 'object' ? piece : { type: String(piece) }
        const href = pieceImages[p.type]
        if (href) {
          const x = nodes[i].x - pieceSize / 2
          const y = nodes[i].y - pieceSize / 2
          pieces.push({ tag: 'image', attrs: { href, x, y, width: pieceSize, height: pieceSize, 'pointer-events': 'none' } })
        } else {
          const fill = p.type.includes('red') ? '#cc2222' : '#44aa44'
          const stroke = p.type.includes('red') ? '#881111' : '#227722'
          pieces.push({ tag: 'circle', attrs: { cx: nodes[i].x, cy: nodes[i].y, r: pointRadius * 1.5, fill, stroke, 'stroke-width': 1.5 } })
        }
      }
      ops.push({ op: 'elements', items: pieces })
      return ops
    },
  },

  'stern-halma': {
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
    computeLayout: sternLayout,
    ops(ctx) {
      const { colors, opts, ox, oy } = ctx
      const { boardW, boardH, innerW, innerH, rim } = sternLayout(opts)
      const { positions, arms, cx, topY, rowH, spacing } = sternHoles(opts, ox, oy)

      const s = spacing / 24
      const midY = topY + 8 * rowH
      const pieceR = spacing * 0.19
      const polyScale = 1.04

      const hex = [[-50.5, -93], [50.5, -93], [104.3, 0], [50.5, 92.9], [-50.5, 92.9], [-104.3, 0]]
        .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
      const tips = [[0, -180.3], [158, -93], [158, 92.9], [0, 180.3], [-158, 92.9], [-158, -93]]
        .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))

      const holeArm = new Array(positions.length).fill('')
      for (const [armName, idxs] of Object.entries(arms)) {
        for (const idx of idxs) holeArm[idx] = armName
      }
      const items = positions.map((hp, i) => ({ x: hp.x, y: hp.y, arm: holeArm[i] }))

      const armFills = [colors.armN, colors.armNE, colors.armSE, colors.armS, colors.armSW, colors.armNW]
      const armPolys = []
      for (let i = 0; i < 6; i++) {
        armPolys.push({ tag: 'polygon', attrs: { points: `${tips[i].x},${tips[i].y} ${hex[i].x},${hex[i].y} ${hex[(i + 1) % 6].x},${hex[(i + 1) % 6].y}`, fill: armFills[i] } })
      }

      const ops = [
        { op: 'element', tag: 'defs', children: [
          { tag: 'filter', attrs: { id: 'board-shadow', x: '-5%', y: '-3%', width: '110%', height: '110%' }, children: [
            { tag: 'feDropShadow', attrs: { dx: 0, dy: 4, stdDeviation: 6, 'flood-color': 'rgba(0,0,0,0.35)' } },
          ] },
        ] },
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

      // Filled starting arms (frontmatter: setup.filledArms + arm palette)
      const filledArms = opts.filledArms || []
      const pieceImages = opts.pieceImages || {}
      const armPieceKeys = ['red-circle', 'blue-circle', 'green-circle', 'black-circle', 'purple-circle', 'brown-circle']
      const armColors = ['#d32f2f', '#1565c0', '#2e7d32', '#1a1a1a', '#6a1b9a', '#5d4037']
      const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
      const pieceSz = pieceR * 1.6
      const pieces = []
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
            pieces.push({ tag: 'image', attrs: { href: img, x: hp.x - pieceSz / 2, y: hp.y - pieceSz / 2, width: pieceSz, height: pieceSz } })
          } else {
            pieces.push({ tag: 'circle', attrs: { cx: hp.x, cy: hp.y, r: pieceR - 1, fill: color, stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 1.5 } })
          }
        }
      }
      ops.push({ op: 'elements', items: pieces })

      const labelPad = spacing * 1.0
      const labelDefs = [
        { text: 'N', x: cx, y: tips[0].y - labelPad },
        { text: 'S', x: cx, y: tips[3].y + labelPad + 5 },
        { text: 'NE', x: tips[1].x + labelPad, y: tips[1].y + 4 },
        { text: 'NW', x: tips[5].x - labelPad, y: tips[5].y + 4 },
        { text: 'SE', x: tips[2].x + labelPad, y: tips[2].y + 4 },
        { text: 'SW', x: tips[4].x - labelPad, y: tips[4].y + 4 },
      ]
      ops.push({ op: 'group', attrs: { 'font-family': 'sans-serif', 'font-size': 10, fill: 'rgba(255,255,255,0.7)', 'font-weight': 600, 'text-anchor': 'middle' }, children: labelDefs.map(l => ({ tag: 'text', attrs: { x: l.x, y: l.y }, text: l.text })) })

      return ops
    },
  },
}

// ─── Provider-shaped wrappers around the single pipeline ────────────────────

function makeGraphStyle(style) {
  return {
    name: style.name,
    positionType: style.positionType,
    labelStyle: style.labelStyle,
    defaultColors: style.defaultColors,
    computeLayout: style.computeLayout,
    render(ctx) {
      const layout = renderGraphLayout({ ops: style.ops(ctx) })
      return elementsToFragment(layout.elements)
    },
  }
}

export const graphStyles = Object.fromEntries(
  Object.entries(STYLES).map(([key, style]) => [key, makeGraphStyle(style)])
)
