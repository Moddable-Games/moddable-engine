export const schema = {
  type: 'graph',
  required: ['nodes', 'edges'],
  parseBoard() {
    return null
  },
  matchBoard() {
    return false
  },
}

export function createGraphTopology(config) {
  const { nodes, edges, directed = false } = config
  const adjacency = new Map()
  const nodeSet = new Set()

  for (const node of nodes) {
    const name = typeof node === 'string' ? node : node.name
    nodeSet.add(name)
    adjacency.set(name, [])
  }

  for (const edge of edges) {
    const [from, to] = Array.isArray(edge) ? edge : [edge.from, edge.to]
    if (adjacency.has(from)) adjacency.get(from).push(to)
    if (!directed && adjacency.has(to)) adjacency.get(to).push(from)
  }

  function isValid(node) {
    return nodeSet.has(node)
  }

  function neighbours(node) {
    return adjacency.get(node) || []
  }

  function distance(from, to) {
    if (from === to) return 0
    const visited = new Set([from])
    const queue = [[from, 0]]
    while (queue.length > 0) {
      const [current, dist] = queue.shift()
      for (const n of neighbours(current)) {
        if (n === to) return dist + 1
        if (!visited.has(n)) {
          visited.add(n)
          queue.push([n, dist + 1])
        }
      }
    }
    return -1
  }

  function shortestPath(from, to) {
    if (from === to) return [from]
    const visited = new Set([from])
    const queue = [[from, [from]]]
    while (queue.length > 0) {
      const [current, path] = queue.shift()
      for (const n of neighbours(current)) {
        if (n === to) return [...path, n]
        if (!visited.has(n)) {
          visited.add(n)
          queue.push([n, [...path, n]])
        }
      }
    }
    return null
  }

  function getNodes() {
    return [...nodeSet]
  }

  function getEdges() {
    const result = []
    const seen = new Set()
    for (const [from, targets] of adjacency) {
      for (const to of targets) {
        const key = directed ? `${from}->${to}` : [from, to].sort().join('-')
        if (!seen.has(key)) {
          seen.add(key)
          result.push([from, to])
        }
      }
    }
    return result
  }

  function degree(node) {
    const adj = adjacency.get(node)
    return adj ? adj.length : 0
  }

  function hasEdge(from, to) {
    const adj = adjacency.get(from)
    return adj ? adj.includes(to) : false
  }

  function toJSON(node) {
    return node
  }

  function fromJSON(str) {
    return str
  }

  function jumpPairs(from, directions) {
    const adj = neighbours(from)
    const pairs = []
    for (const over of adj) {
      for (const landing of neighbours(over)) {
        if (landing !== from && !adj.includes(landing)) {
          pairs.push({ over, landing })
        }
      }
    }
    return pairs
  }

  function adjacentPairs(from) {
    const adj = neighbours(from)
    const pairs = []
    for (const adjacent of adj) {
      for (const far of neighbours(adjacent)) {
        if (far !== from) {
          pairs.push({ adjacent, far })
        }
      }
    }
    return pairs
  }

  function getLayout(opts = {}) {
    const { nodeRadius = 12, width = 400, height = 400 } = opts
    const nodeList = getNodes()
    const positions = opts.positions || circularLayout(nodeList, width, height)

    return {
      getDimensions() {
        return { width, height }
      },
      getCells() {
        return nodeList.map(node => {
          const c = positions[node] || { x: 0, y: 0 }
          return { key: node, center: c, cellType: 'node', element: 'circle', attrs: { cx: c.x, cy: c.y, r: nodeRadius } }
        })
      },
      getLines() {
        return getEdges().map(([from, to]) => ({
          from: positions[from] || { x: 0, y: 0 },
          to: positions[to] || { x: 0, y: 0 },
        }))
      },
      defaults: {
        cells: { node: { fill: '#333' } },
        lines: { stroke: '#333', 'stroke-width': 1.5 },
      },
    }
  }

  function serializePosition(cellStates, vocabulary) {
    const symbolMap = buildGraphSymbolMap(vocabulary)
    const parts = []
    for (const node of getNodes()) {
      const cell = cellStates[node] || (cellStates.get ? cellStates.get(node) : null)
      if (cell !== null && cell !== undefined) {
        parts.push(`${node}=${symbolMap.toSymbol(cell)}`)
      }
    }
    return parts.join(',')
  }

  function parsePosition(notation, vocabulary) {
    const symbolMap = buildGraphSymbolMap(vocabulary)
    const cellStates = {}
    if (!notation) return cellStates
    for (const part of notation.split(',')) {
      const [node, symbol] = part.split('=')
      if (node && symbol) {
        const piece = symbolMap.fromSymbol(symbol.trim())
        if (piece) cellStates[node.trim()] = piece
      }
    }
    return cellStates
  }

  function buildGraphSymbolMap(vocabulary) {
    const toSym = new Map()
    const fromSym = new Map()

    if (!vocabulary) {
      return {
        toSymbol: (cell) => cell.symbol || '?',
        fromSymbol: (ch) => ({ symbol: ch }),
      }
    }

    for (const [type, def] of Object.entries(vocabulary)) {
      if (def.symbols && !def.symbols.count) {
        for (const [owner, symbol] of Object.entries(def.symbols)) {
          const ownerKey = /^\d+$/.test(owner) ? parseInt(owner, 10) : owner
          toSym.set(`${type}.${ownerKey}`, symbol)
          fromSym.set(symbol, { type, owner: ownerKey })
        }
      }
    }

    return {
      toSymbol(cell) {
        if (typeof cell === 'string') return cell
        return toSym.get(`${cell.type}.${cell.owner}`) || '?'
      },
      fromSymbol(ch) {
        return fromSym.get(ch) || null
      },
    }
  }

  function computeStructure(type, params, size, opts) {
    if (type === 'concentric-rings') return computeConcentricRings(params, size, opts)
    if (type === 'perimeter-cross') return computePerimeterCross(params, size, opts)
    if (type === 'grid-cross') return computeGridCross(params, size, opts)
    if (type === 'star') return computeStar(params, size, opts)
    return { nodes: [], edges: [], width: size, height: size }
  }

  function computeConcentricRings(params, size, opts) {
    const rings = params.rings || 3
    const midpoints = params.midpoints !== false
    const diagonals = params.diagonals || false
    const lineColor = opts.edgeStyle?.stroke || '#333'

    const margin = size * 0.0625
    const maxInset = size * 0.375
    const step = rings > 1 ? (maxInset - margin) / (rings - 1) : 0
    const cx = size / 2, cy = size / 2

    const ringRects = []
    for (let i = 0; i < rings; i++) {
      const inset = margin + i * step
      ringRects.push({ x: inset, y: inset, w: size - inset * 2, h: size - inset * 2 })
    }

    const nodes = []
    for (const rect of ringRects) {
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: rect.y })
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: rect.y })
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: rect.y + rect.h })
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: rect.y + rect.h })
      if (midpoints) {
        nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: rect.y })
        nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: cy })
        nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: rect.y + rect.h })
        nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: cy })
      }
    }
    if (rings === 1 && midpoints) nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: cy })

    const edges = []
    const ppRing = midpoints ? 8 : 4
    for (let r = 0; r < rings; r++) {
      const base = r * ppRing
      for (let i = 0; i < 4; i++) {
        const curr = base + i
        const next = base + ((i + 1) % 4)
        if (midpoints) {
          edges.push({ from: nodes[curr].id, to: nodes[base + 4 + i].id })
          edges.push({ from: nodes[base + 4 + i].id, to: nodes[next].id })
        } else {
          edges.push({ from: nodes[curr].id, to: nodes[next].id })
        }
      }
    }
    if (midpoints && rings > 1) {
      for (let i = 0; i < 4; i++) {
        for (let r = 0; r < rings - 1; r++) {
          edges.push({ from: nodes[r * ppRing + 4 + i].id, to: nodes[(r + 1) * ppRing + 4 + i].id })
        }
      }
    }
    if (diagonals) {
      if (rings === 1) {
        edges.push({ from: nodes[0].id, to: nodes[2].id })
        edges.push({ from: nodes[1].id, to: nodes[3].id })
      } else {
        for (let i = 0; i < 4; i++) {
          edges.push({ from: nodes[i].id, to: nodes[(rings - 1) * ppRing + i].id })
        }
      }
    }

    const structures = []
    for (const rect of ringRects) {
      structures.push({ tag: 'rect', attrs: {
        x: rect.x, y: rect.y, width: rect.w, height: rect.h,
        fill: 'none', stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square',
      }})
    }
    if (midpoints) {
      if (rings === 1) {
        const r = ringRects[0]
        structures.push({ tag: 'line', attrs: { x1: cx, y1: r.y, x2: cx, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: r.x, y1: cy, x2: r.x + r.w, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      } else {
        structures.push({ tag: 'line', attrs: { x1: cx, y1: ringRects[0].y, x2: cx, y2: ringRects[rings - 1].y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        const last = ringRects[rings - 1]
        structures.push({ tag: 'line', attrs: { x1: cx, y1: last.y + last.h, x2: cx, y2: ringRects[0].y + ringRects[0].h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: ringRects[0].x, y1: cy, x2: ringRects[rings - 1].x, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: last.x + last.w, y1: cy, x2: ringRects[0].x + ringRects[0].w, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      }
    }
    if (diagonals) {
      if (rings === 1) {
        const r = ringRects[0]
        structures.push({ tag: 'line', attrs: { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: r.x + r.w, y1: r.y, x2: r.x, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      } else {
        const o = ringRects[0], inner = ringRects[rings - 1]
        structures.push({ tag: 'line', attrs: { x1: o.x, y1: o.y, x2: inner.x, y2: inner.y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y, x2: inner.x + inner.w, y2: inner.y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: o.x, y1: o.y + o.h, x2: inner.x, y2: inner.y + inner.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
        structures.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y + o.h, x2: inner.x + inner.w, y2: inner.y + inner.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      }
    }

    return { nodes, edges, width: size, height: size, structures, zones: [] }
  }

  function computePerimeterCross(params, size, opts) {
    const sides = params.sides || 4
    const nodesPerSide = params.nodesPerSide || 5
    const hasDiagonals = params.diagonals !== false
    const intermediates = params.intermediatesPerDiagonal || 2
    const lineColor = opts.edgeStyle?.stroke || '#333'

    const margin = size * 0.08
    const x0 = margin, x1 = size - margin, y0 = margin, y1 = size - margin
    const cx = size / 2, cy = size / 2
    const corners = [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y0 }]

    const nodes = []
    const edges = []

    for (let side = 0; side < sides; side++) {
      const from = corners[side], to = corners[(side + 1) % sides]
      nodes.push({ id: `n${nodes.length + 1}`, x: from.x, y: from.y, type: 'junction' })
      for (let i = 1; i < nodesPerSide; i++) {
        nodes.push({ id: `n${nodes.length + 1}`, x: from.x + (to.x - from.x) * i / nodesPerSide, y: from.y + (to.y - from.y) * i / nodesPerSide })
      }
    }
    const perimeterCount = nodes.length
    for (let i = 0; i < perimeterCount; i++) edges.push({ from: nodes[i].id, to: nodes[(i + 1) % perimeterCount].id })

    nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: cy, type: 'centre' })
    const centreIdx = nodes.length - 1

    if (hasDiagonals) {
      const cornerIndices = []
      for (let s = 0; s < sides; s++) cornerIndices.push(s * nodesPerSide)
      for (const ci of cornerIndices) {
        const corner = nodes[ci]
        let prev = ci
        for (let i = 1; i <= intermediates; i++) {
          const t = i / (intermediates + 1)
          nodes.push({ id: `n${nodes.length + 1}`, x: corner.x + (cx - corner.x) * t, y: corner.y + (cy - corner.y) * t })
          edges.push({ from: nodes[prev].id, to: nodes[nodes.length - 1].id })
          prev = nodes.length - 1
        }
        edges.push({ from: nodes[prev].id, to: nodes[centreIdx].id })
      }
    }

    return { nodes, edges, width: size, height: size, structures: [], zones: [] }
  }

  function computeGridCross(params, size, opts) {
    const rowDefs = params.rows || [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]]
    const fortressRows = params.fortressRows || 0
    const hasDiagonals = params.diagonals !== false
    const lineColor = opts.edgeStyle?.stroke || '#333'

    const maxCol = Math.max(...rowDefs.flat())
    const maxRow = rowDefs.length - 1
    const margin = size * 0.08
    const usable = size - margin * 2
    const spacing = usable / Math.max(maxCol, maxRow)
    const xOffset = (size - maxCol * spacing) / 2
    const yOffset = (size - maxRow * spacing) / 2

    const nodes = []
    const edges = []
    const nodeMap = {}

    for (let y = 0; y < rowDefs.length; y++) {
      for (const col of rowDefs[y]) {
        const idx = nodes.length
        nodeMap[`${y},${col}`] = idx
        nodes.push({ id: `n${idx + 1}`, x: xOffset + col * spacing, y: yOffset + y * spacing })
      }
    }

    for (let y = 0; y < rowDefs.length; y++) {
      const cols = rowDefs[y]
      for (let i = 0; i < cols.length - 1; i++) {
        if (cols[i + 1] - cols[i] === 1) {
          edges.push({ from: nodes[nodeMap[`${y},${cols[i]}`]].id, to: nodes[nodeMap[`${y},${cols[i + 1]}`]].id })
        }
      }
    }
    for (let y = 0; y < rowDefs.length - 1; y++) {
      for (const col of rowDefs[y]) {
        if (rowDefs[y + 1].includes(col)) {
          edges.push({ from: nodes[nodeMap[`${y},${col}`]].id, to: nodes[nodeMap[`${y + 1},${col}`]].id })
        }
      }
    }
    if (hasDiagonals) {
      for (let y = 0; y < rowDefs.length - 1; y++) {
        for (const col of rowDefs[y]) {
          if (rowDefs[y].includes(col + 1) && rowDefs[y + 1].includes(col) && rowDefs[y + 1].includes(col + 1)) {
            edges.push({ from: nodes[nodeMap[`${y},${col}`]].id, to: nodes[nodeMap[`${y + 1},${col + 1}`]].id })
            edges.push({ from: nodes[nodeMap[`${y},${col + 1}`]].id, to: nodes[nodeMap[`${y + 1},${col}`]].id })
          }
        }
      }
    }

    const zones = []
    if (fortressRows > 0) {
      const fNodes = nodes.filter((_, i) => {
        for (let y = 0; y < fortressRows; y++) {
          if (rowDefs[y].some(c => nodeMap[`${y},${c}`] === i)) return true
        }
        return false
      })
      if (fNodes.length) {
        const bx = Math.min(...fNodes.map(n => n.x))
        const by = Math.min(...fNodes.map(n => n.y))
        const bw = Math.max(...fNodes.map(n => n.x)) - bx
        const bh = Math.max(...fNodes.map(n => n.y)) - by
        zones.push({ type: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: 'rgba(40,80,180,0.15)' } })
      }
    }

    return { nodes, edges, width: size, height: size, structures: [], zones }
  }

  function computeStar(params, size, opts) {
    const armSize = params.armSize || 4
    const spacing = params.spacing || 24
    const rowH = spacing * Math.sqrt(3) / 2
    const margin = spacing * 2.5
    const innerW = spacing * 16 + margin * 2
    const innerH = Math.round(rowH * 16) + margin * 2 + spacing
    const boardW = innerW
    const boardH = innerH
    const cx = spacing * 8 + margin
    const topY = margin + spacing * 0.5

    const rowWidths = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]
    const nodes = []

    for (let row = 0; row < 17; row++) {
      const w = rowWidths[row]
      const y = topY + row * rowH
      const startX = cx - (w - 1) * spacing / 2
      for (let i = 0; i < w; i++) {
        const x = startX + i * spacing
        let arm = undefined
        if (row < 4) arm = 'N'
        else if (row >= 13) arm = 'S'
        else if (row >= 4 && row <= 7) {
          const armWidth = 4 - (row - 4)
          if (i < armWidth) arm = 'NW'
          else if (i >= w - armWidth) arm = 'NE'
        } else if (row >= 9 && row <= 12) {
          const armWidth = row - 8
          if (i < armWidth) arm = 'SW'
          else if (i >= w - armWidth) arm = 'SE'
        }
        nodes.push({ id: `h${nodes.length + 1}`, x, y, type: arm ? `arm-${arm}` : 'centre', arm })
      }
    }

    return { nodes, edges: [], width: boardW, height: boardH, structures: [], zones: [], labels: [] }
  }

  function renderLayout(config = {}) {
    if (config.ops) return renderGraphLayout(config)
    const {
      nodes: inputNodes,
      edges: inputEdges,
      structure,
      params,
      width: inputWidth = 320,
      height: inputHeight = 320,
      backgrounds = [],
      zones: inputZones = [],
      structures: inputStructures = [],
      edgeStyle = { stroke: '#333', strokeWidth: 2.5, linecap: 'round' },
      nodeRadius = 7,
      nodeColor = '#333',
      nodeScale = {},
      nodeColorMap = {},
      labels: inputLabels = [],
      defs = [],
    } = config

    let nodeList, edgeList, width, height, zones, structures, labels
    if (structure && !inputNodes) {
      const generated = computeStructure(structure, params || {}, inputWidth, { edgeStyle, nodeRadius, nodeColor })
      nodeList = generated.nodes
      edgeList = generated.edges
      width = generated.width || inputWidth
      height = generated.height || inputHeight
      zones = [...(generated.zones || []), ...inputZones]
      structures = [...(generated.structures || []), ...inputStructures]
      labels = [...(generated.labels || []), ...inputLabels]
    } else {
      nodeList = inputNodes || []
      edgeList = inputEdges || []
      width = inputWidth
      height = inputHeight
      zones = inputZones
      structures = inputStructures
      labels = inputLabels
    }

    const elements = []

    // 1. Backgrounds
    for (const bg of backgrounds) {
      const attrs = { ...bg }
      if (attrs.x === undefined) attrs.x = 0
      if (attrs.y === undefined) attrs.y = 0
      if (attrs.width === undefined) attrs.width = width
      if (attrs.height === undefined) attrs.height = height
      elements.push({ tag: 'rect', attrs })
    }

    // 2. Zone fills
    for (const zone of zones) {
      elements.push({ tag: zone.type || 'rect', attrs: zone.attrs })
    }

    // 3. Structure shapes (ring rects, star outlines, fortress borders)
    for (const s of structures) {
      elements.push(s)
    }

    // Build position lookup
    const posMap = {}
    for (const n of nodeList) {
      posMap[n.id] = { x: n.x, y: n.y }
    }

    // 4. Edges
    for (const e of edgeList) {
      const fromId = typeof e.from === 'string' ? e.from : nodeList[e.from]?.id
      const toId = typeof e.to === 'string' ? e.to : nodeList[e.to]?.id
      const fromPos = posMap[fromId]
      const toPos = posMap[toId]
      if (!fromPos || !toPos) continue
      elements.push({ tag: 'line', attrs: {
        x1: fromPos.x, y1: fromPos.y,
        x2: toPos.x, y2: toPos.y,
        stroke: edgeStyle.stroke,
        'stroke-width': edgeStyle.strokeWidth,
        'stroke-linecap': edgeStyle.linecap || 'round',
      }})
    }

    // 5. Node dots
    for (const n of nodeList) {
      const scale = nodeScale[n.type] || 1
      const fill = nodeColorMap[n.type] || nodeColor
      elements.push({ tag: 'circle', attrs: {
        cx: n.x, cy: n.y, r: nodeRadius * scale, fill,
      }})
    }

    // 6. Hit targets
    const cells = []
    for (const n of nodeList) {
      const attrs = {
        cx: n.x, cy: n.y, r: nodeRadius * 2,
        fill: 'transparent', 'data-sq': n.id, class: 'board-cell',
        'data-type': 'node',
      }
      if (n.type) attrs['data-type'] = n.type
      if (n.arm) attrs['data-arm'] = n.arm
      cells.push({
        id: n.id, x: n.x, y: n.y,
        element: { tag: 'circle', attrs },
      })
    }

    // 8. Labels
    const labelElements = []
    for (const lbl of labels) {
      labelElements.push({ tag: 'text', attrs: {
        x: lbl.x, y: lbl.y,
        'text-anchor': lbl.anchor || 'middle',
        'font-size': lbl.fontSize || 10,
        fill: lbl.fill || 'rgba(255,255,255,0.5)',
        'font-family': lbl.fontFamily || 'sans-serif',
        'pointer-events': 'none',
      }, text: lbl.text })
    }

    return { width, height, elements, cells, labels: labelElements, defs, tileSize: nodeRadius * 3.5 }
  }

  return {
    size: nodeSet.size,
    directed,
    isValid,
    neighbours,
    distance,
    shortestPath,
    getNodes,
    getEdges,
    degree,
    hasEdge,
    toJSON,
    fromJSON,
    jumpPairs,
    adjacentPairs,
    getLayout,
    renderLayout,
    serializePosition,
    parsePosition,
  }
}

// ─── Graph render pipeline — ONE parametric renderer for every graph board (#18) ───
//
// The notation is an ordered list of drawing ops. The pipeline walks the list
// once and emits structured SVG elements. It never branches on game, variant,
// or board style — needing a new branch here means the consolidation has
// failed; extend the op vocabulary parametrically instead.
//
// Graph ops work in ABSOLUTE coordinates (nodes carry x/y — structure
// generators are data factories living at the bridge/frontmatter layer):
//   rect      — raw rect, attrs in given (insertion) order
//   element   — raw element (polygon, defs, text, ...), children supported
//   elements  — list of raw elements
//   group     — <g attrs>children</g> (empty attrs → bare <g>)
//   edges     — <g attrs> with one line per node-index pair
//   nodes     — per node: dot circle (+ optional interleaved hit-target
//               circle with id/data-type/extra attrs), optionally grouped
//
// Attribute order is insertion order — part of the byte-identity contract
// (snapshot suite must stay byte-identical). Game data (station positions,
// ring geometry, fortress shapes, arm polygons) NEVER lives here — it
// arrives inside ops from the bridge today, from frontmatter via produce()
// later.

export function renderGraphLayout(config = {}) {
  const elements = []
  const cells = []
  for (const op of config.ops || []) {
    GRAPH_OP_HANDLERS[op.op](op, elements, cells)
  }
  return { width: config.width || 0, height: config.height || 0, elements, cells, labels: [], defs: [] }
}

const GRAPH_OP_HANDLERS = {

  rect(op, elements) {
    elements.push({ tag: 'rect', attrs: op.attrs })
  },

  element(op, elements) {
    elements.push({ tag: op.tag, attrs: op.attrs, text: op.text, children: op.children })
  },

  elements(op, elements) {
    for (const el of op.items) elements.push(el)
  },

  group(op, elements) {
    elements.push({ tag: 'g', attrs: op.attrs, children: op.children })
  },

  edges(op, elements) {
    const children = []
    for (const [a, b] of op.pairs) {
      children.push({ tag: 'line', attrs: { x1: op.nodes[a].x, y1: op.nodes[a].y, x2: op.nodes[b].x, y2: op.nodes[b].y } })
    }
    elements.push({ tag: 'g', attrs: op.attrs, children })
  },

  nodes(op, elements, cells) {
    const resolve = (v, node, i) => typeof v === 'function' ? v(node, i) : v
    const children = []
    for (let i = 0; i < op.items.length; i++) {
      const node = op.items[i]
      const dotAttrs = { cx: node.x, cy: node.y, r: resolve(op.dot.radius, node, i) }
      if (op.dot.fill !== undefined) dotAttrs.fill = resolve(op.dot.fill, node, i)
      children.push({ tag: 'circle', attrs: dotAttrs })
      if (op.hit) {
        const sq = resolve(op.hit.id, node, i)
        const attrs = { cx: node.x, cy: node.y, r: resolve(op.hit.radius, node, i), fill: 'transparent', class: 'board-cell', 'data-sq': sq, 'data-type': resolve(op.hit.dataType, node, i) }
        if (op.hit.extraAttrs) {
          const extra = resolve(op.hit.extraAttrs, node, i)
          if (extra) Object.assign(attrs, extra)
        }
        children.push({ tag: 'circle', attrs })
        cells.push({ id: sq, x: node.x, y: node.y })
      }
    }
    if (op.group) {
      elements.push({ tag: 'g', attrs: op.group, children })
    } else {
      for (const el of children) elements.push(el)
    }
  },
}

function circularLayout(nodes, width, height) {
  const positions = {}
  const cx = width / 2, cy = height / 2
  const r = Math.min(width, height) * 0.4
  const n = nodes.length
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    positions[nodes[i]] = {
      x: Math.round(cx + r * Math.cos(angle)),
      y: Math.round(cy + r * Math.sin(angle)),
    }
  }
  return positions
}
