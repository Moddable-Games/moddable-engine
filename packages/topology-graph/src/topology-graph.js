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

  function renderLayout(config = {}) {
    const {
      nodes: inputNodes,
      edges: inputEdges,
      width = 320,
      height = 320,
      backgrounds = [],
      zones = [],
      structures = [],
      edgeStyle = { stroke: '#333', strokeWidth: 2.5, linecap: 'round' },
      nodeRadius = 7,
      nodeColor = '#333',
      nodeScale = {},
      nodeColorMap = {},
      labels = [],
      defs = [],
    } = config

    const nodeList = inputNodes || []
    const edgeList = inputEdges || []

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
