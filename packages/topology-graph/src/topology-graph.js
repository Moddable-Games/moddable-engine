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
        return nodeList.map(node => ({
          key: node,
          center: positions[node] || { x: 0, y: 0 },
          shape: 'circle',
          radius: nodeRadius,
        }))
      },
      getLines() {
        return getEdges().map(([from, to]) => ({
          from: positions[from] || { x: 0, y: 0 },
          to: positions[to] || { x: 0, y: 0 },
        }))
      },
    }
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
