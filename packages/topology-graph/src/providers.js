/**
 * Graph SVG providers — produce SVG string fragments for graph-based boards.
 *
 * Providers: nyout, morris, asalto, sternHalma
 *
 * Moved verbatim from js/board-diagrams.js.
 */

export const nyout = {
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

export const morris = {
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

function convexHull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length <= 2) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

export const asalto = {
  name: 'asalto',
  positionType: 'node',
  labelStyle: 'none',
  defaultColors: { background: '#f5e6c8', line: '#2a2a2a', point: '#2a2a2a', fortress: 'rgba(40,80,180,0.15)', fortressBorder: '#3355aa' },
  computeLayout(opts) {
    const size = opts.boardSize || 320
    return { boardW: size, boardH: size }
  },
  getNodes(size, ox, oy, opts) {
    const nodes = []
    const edges = []
    const fortressNodes = new Set()

    // Grid layout from variant config, or default Asalto cross (7×7)
    const gridDef = opts.asaltoGrid || {
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

    // Horizontal edges
    for (const row of rowDefs) {
      for (let i = 0; i < row.cols.length - 1; i++) {
        if (row.cols[i + 1] - row.cols[i] === 1) {
          edges.push([nodeMap[`${row.y},${row.cols[i]}`], nodeMap[`${row.y},${row.cols[i + 1]}`]])
        }
      }
    }
    // Vertical edges
    for (let ri = 0; ri < rowDefs.length - 1; ri++) {
      const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
      for (const col of r1.cols) {
        if (r2.cols.includes(col)) {
          edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col}`]])
        }
      }
    }
    // Diagonal edges: both diagonals within each cell (requires all 4 corners to exist)
    for (let ri = 0; ri < rowDefs.length - 1; ri++) {
      const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
      for (const col of r1.cols) {
        if (r1.cols.includes(col + 1) && r2.cols.includes(col) && r2.cols.includes(col + 1)) {
          edges.push([nodeMap[`${r1.y},${col}`], nodeMap[`${r2.y},${col + 1}`]])
          edges.push([nodeMap[`${r1.y},${col + 1}`], nodeMap[`${r2.y},${col}`]])
        }
      }
    }

    // Extra nodes with explicit connections (e.g. fortress ears)
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
  },
  render(ctx) {
    const { colors, opts, ox, oy } = ctx
    const size = opts.boardSize || 320
    const pointRadius = opts.pointRadius || 6
    const { nodes, edges, fortressNodes, nodeMap } = this.getNodes(size, ox, oy, opts)
    const parts = []

    parts.push(`<rect x="${ox}" y="${oy}" width="${size}" height="${size}" fill="${colors.background}" rx="4"/>`)

    // Fortress highlight — main rectangle + ear triangles (each follows node lines)
    const fNodes = [...fortressNodes].map(i => nodes[i])
    if (fNodes.length > 0) {
      const gridDef = opts.asaltoGrid || { rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]], fortressRows: 2 }
      const hasEars = gridDef.extraNodes && gridDef.extraNodes.some(n => n.fortress)
      // Main body: the grid-row fortress nodes (excluding extras)
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
      parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${colors.fortress}" stroke="none"/>`)
      // Ear triangles
      if (hasEars) {
        const extras = gridDef.extraNodes.filter(e => e.fortress)
        const totalNodes = nodes.length
        const extraStart = totalNodes - gridDef.extraNodes.length
        for (const e of extras) {
          const eIdx = gridDef.extraNodes.indexOf(e)
          const ear = nodes[extraStart + eIdx]
          // Each ear connects to two body nodes — draw triangle
          const targets = e.connectsTo.map(t => nodes[nodeMap[`${t[0]},${t[1]}`]])
          if (targets.length >= 2) {
            const tri = `${ear.x},${ear.y} ${targets[0].x},${targets[0].y} ${targets[1].x},${targets[1].y}`
            parts.push(`<polygon points="${tri}" fill="${colors.fortress}" stroke="none"/>`)
          }
        }
      }
      // Stroke the main body rect border (no diagonal strokes from ear triangles)
      parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${colors.fortressBorder}" stroke-width="2"/>`)
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

    // Draw setup pieces from position map (uses gallery images when available)
    const position = opts.position || {}
    const pieceImages = opts.pieceImages || {}
    const pieceSize = pointRadius * 3.5
    for (let i = 0; i < nodes.length; i++) {
      const sq = `n${i + 1}`
      const piece = position[sq]
      if (!piece) continue
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const href = pieceImages[p.type]
      if (href) {
        const x = nodes[i].x - pieceSize / 2
        const y = nodes[i].y - pieceSize / 2
        parts.push(`<image href="${href}" x="${x}" y="${y}" width="${pieceSize}" height="${pieceSize}" pointer-events="none"/>`)
      } else {
        const fill = p.type.includes('red') ? '#cc2222' : '#44aa44'
        const stroke = p.type.includes('red') ? '#881111' : '#227722'
        parts.push(`<circle cx="${nodes[i].x}" cy="${nodes[i].y}" r="${pointRadius * 1.5}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`)
      }
    }

    return parts.join('')
  },
}


export const sternHalma = {
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

