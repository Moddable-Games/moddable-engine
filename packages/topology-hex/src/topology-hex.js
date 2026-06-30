export const schema = {
  type: 'hex',
  required: [],
  validate(config) {
    return config.radius !== undefined || config.size !== undefined
  },
  parseBoard(board) {
    const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
    if (!match) return null
    return { type: 'hex', radius: Math.floor(parseInt(match[1], 10) / 2) }
  },
  matchBoard(board) {
    return /hex/i.test(board)
  },
}

const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

const HEX_DIAGONALS = [
  { q: 2, r: -1 }, { q: 1, r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 1 },
]

const DIRECTION_CATEGORIES = {
  orthogonal: DIRECTIONS,
  diagonal: HEX_DIAGONALS,
  all: [...DIRECTIONS, ...HEX_DIAGONALS],
}

export function createHexTopology(config) {
  const { radius, size, shape = 'hexagonal', orientation = 'pointy' } = config
  const cells = new Map()

  if (shape === 'rhombus' && size) {
    generateRhombus(size, cells)
  } else {
    generateHexGrid(radius, cells)
  }

  function generateHexGrid(r, map) {
    for (let q = -r; q <= r; q++) {
      const r1 = Math.max(-r, -q - r)
      const r2 = Math.min(r, -q + r)
      for (let ri = r1; ri <= r2; ri++) {
        const ring = Math.max(Math.abs(q), Math.abs(ri), Math.abs(-q - ri))
        map.set(key(q, ri), { q, r: ri, ring })
      }
    }
  }

  function generateRhombus(s, map) {
    for (let q = 0; q < s; q++) {
      for (let r = 0; r < s; r++) {
        map.set(key(q, r), { q, r, ring: 0 })
      }
    }
  }

  function generateRing(ring) {
    const results = []
    let hex = { q: 0, r: -ring }
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < ring; j++) {
        results.push({ q: hex.q, r: hex.r })
        hex = { q: hex.q + DIRECTIONS[i].q, r: hex.r + DIRECTIONS[i].r }
      }
    }
    return results
  }

  function key(q, r) {
    return `${q},${r}`
  }

  function parse(k) {
    const [q, r] = k.split(',').map(Number)
    return { q, r }
  }

  function isValid(coord) {
    if (typeof coord === 'string') return cells.has(coord)
    return cells.has(key(coord.q, coord.r))
  }

  function neighbours(coord) {
    const { q, r } = typeof coord === 'string' ? parse(coord) : coord
    const result = []
    for (const d of DIRECTIONS) {
      const nq = q + d.q, nr = r + d.r
      const k = key(nq, nr)
      if (cells.has(k)) result.push(k)
    }
    return result
  }

  function distance(a, b) {
    const ac = typeof a === 'string' ? parse(a) : a
    const bc = typeof b === 'string' ? parse(b) : b
    return (Math.abs(ac.q - bc.q) + Math.abs(ac.q + ac.r - bc.q - bc.r) + Math.abs(ac.r - bc.r)) / 2
  }

  function ring(n) {
    const results = []
    for (const [k, cell] of cells) {
      if (cell.ring === n) results.push(k)
    }
    return results
  }

  function lineOfSight(from, to) {
    const a = typeof from === 'string' ? parse(from) : from
    const b = typeof to === 'string' ? parse(to) : to
    const n = distance(a, b)
    if (n === 0) return []
    const results = []
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const q = Math.round(a.q + (b.q - a.q) * t)
      const r = Math.round(a.r + (b.r - a.r) * t)
      const k = key(q, r)
      if (cells.has(k)) results.push(k)
    }
    return results
  }

  function ray(from, direction, maxSteps) {
    const a = typeof from === 'string' ? parse(from) : from
    const d = DIRECTIONS[direction] || direction
    const results = []
    let q = a.q + d.q, r = a.r + d.r
    let steps = 0
    const limit = maxSteps || radius * 2
    while (steps < limit) {
      const k = key(q, r)
      if (!cells.has(k)) break
      results.push(k)
      q += d.q
      r += d.r
      steps++
    }
    return results
  }

  function toJSON(coord) {
    if (typeof coord === 'string') return coord
    return key(coord.q, coord.r)
  }

  function fromJSON(str) {
    return parse(str)
  }

  function toPixel(coord, size) {
    const { q, r } = typeof coord === 'string' ? parse(coord) : coord
    if (orientation === 'flat') {
      return { x: size * (3 / 2 * q), y: size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }
    }
    return { x: size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y: size * (3 / 2 * r) }
  }

  function getCorners(center, size) {
    const corners = []
    for (let i = 0; i < 6; i++) {
      const angleDeg = orientation === 'flat' ? 60 * i : 60 * i - 30
      const angleRad = Math.PI / 180 * angleDeg
      corners.push({
        x: center.x + size * Math.cos(angleRad),
        y: center.y + size * Math.sin(angleRad),
      })
    }
    return corners
  }

  function getAllCells() {
    return [...cells.keys()]
  }

  function getCellCount() {
    return cells.size
  }

  function getRing(coord) {
    const k = typeof coord === 'string' ? coord : key(coord.q, coord.r)
    const cell = cells.get(k)
    return cell ? cell.ring : -1
  }

  function rays(from, directionInput, maxSteps) {
    if (typeof directionInput === 'string') {
      const dirs = DIRECTION_CATEGORIES[directionInput] || DIRECTIONS
      return dirs.map(d => ray(from, d, maxSteps))
    }
    const indices = directionInput || [0, 1, 2, 3, 4, 5]
    return indices.map(d => ray(from, d, maxSteps))
  }

  function leapTargets(from, input) {
    if (typeof input === 'string') {
      const offsets = DIRECTION_CATEGORIES[input] || []
      return leapByOffsets(from, offsets)
    }
    if (typeof input === 'number') {
      return leapByRange(from, input)
    }
    return leapByOffsets(from, input)
  }

  function leapByOffsets(from, offsets) {
    const a = typeof from === 'string' ? parse(from) : from
    const targets = []
    for (const d of offsets) {
      const k = key(a.q + d.q, a.r + d.r)
      if (cells.has(k)) targets.push(k)
    }
    return targets
  }

  function leapByRange(from, range) {
    const a = typeof from === 'string' ? parse(from) : from
    const targets = []
    for (let q = -range; q <= range; q++) {
      const r1 = Math.max(-range, -q - range)
      const r2 = Math.min(range, -q + range)
      for (let r = r1; r <= r2; r++) {
        if (q === 0 && r === 0) continue
        const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
        if (dist === range) {
          const k = key(a.q + q, a.r + r)
          if (cells.has(k)) targets.push(k)
        }
      }
    }
    return targets
  }

  function jumpPairs(from, directionIndices) {
    const a = typeof from === 'string' ? parse(from) : from
    const indices = directionIndices || [0, 1, 2, 3, 4, 5]
    const pairs = []
    for (const di of indices) {
      const d = DIRECTIONS[di]
      const overQ = a.q + d.q, overR = a.r + d.r
      const overKey = key(overQ, overR)
      if (!cells.has(overKey)) continue
      const landQ = overQ + d.q, landR = overR + d.r
      const landKey = key(landQ, landR)
      if (!cells.has(landKey)) continue
      pairs.push({ over: overKey, landing: landKey })
    }
    return pairs
  }

  function adjacentPairs(from, directionIndices) {
    const a = typeof from === 'string' ? parse(from) : from
    const indices = directionIndices || [0, 1, 2, 3, 4, 5]
    const pairs = []
    for (const di of indices) {
      const d = DIRECTIONS[di]
      const adjQ = a.q + d.q, adjR = a.r + d.r
      const adjKey = key(adjQ, adjR)
      if (!cells.has(adjKey)) continue
      const farQ = adjQ + d.q, farR = adjR + d.r
      const farKey = key(farQ, farR)
      if (!cells.has(farKey)) continue
      pairs.push({ adjacent: adjKey, far: farKey })
    }
    return pairs
  }

  function getLayout(opts = {}) {
    const { cellSize = 20 } = opts
    let cachedDims = null

    function computeDims() {
      if (cachedDims) return cachedDims
      const allKeys = getAllCells()
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const k of allKeys) {
        const px = toPixel(k, cellSize)
        minX = Math.min(minX, px.x); maxX = Math.max(maxX, px.x)
        minY = Math.min(minY, px.y); maxY = Math.max(maxY, px.y)
      }
      cachedDims = {
        width: (maxX - minX) + cellSize * 2.5,
        height: (maxY - minY) + cellSize * 2.5,
        offsetX: -minX + cellSize * 1.25,
        offsetY: -minY + cellSize * 1.25,
      }
      return cachedDims
    }

    return {
      getDimensions() { return computeDims() },
      getCells() {
        const dims = computeDims()
        return getAllCells().map(k => {
          const px = toPixel(k, cellSize)
          const center = { x: px.x + dims.offsetX, y: px.y + dims.offsetY }
          const corners = getCorners(center, cellSize)
          const points = corners.map(c => `${c.x},${c.y}`).join(' ')
          return { key: k, center, cellType: 'default', element: 'polygon', attrs: { points } }
        })
      },
      getAnnotations() {
        const dims = computeDims()
        const center = toPixel('0,0', cellSize)
        const cx = center.x + dims.offsetX
        const cy = center.y + dims.offsetY
        return [{ element: 'circle', attrs: { cx, cy, r: 3 }, cellType: 'annotation' }]
      },
      defaults: {
        cells: { default: { fill: 'none', stroke: '#333', 'stroke-width': 1 } },
        annotations: { annotation: { fill: '#333' } },
      },
    }
  }

  function serializePosition(cellStates, vocabulary) {
    const symbolMap = buildHexSymbolMap(vocabulary)
    if (shape === 'rhombus' && size) {
      const rowStrings = []
      for (let r = 0; r < size; r++) {
        let rowStr = ''
        let empty = 0
        for (let q = 0; q < size; q++) {
          const k = key(q, r)
          const cell = cellStates[k] || (cellStates.get ? cellStates.get(k) : null)
          if (cell === null || cell === undefined) {
            empty++
          } else {
            if (empty > 0) { rowStr += String(empty); empty = 0 }
            rowStr += symbolMap.toSymbol(cell)
          }
        }
        if (empty > 0) rowStr += String(empty)
        rowStrings.push(rowStr)
      }
      return rowStrings.join('/')
    }
    const allKeys = getAllCells().sort()
    let result = ''
    let empty = 0
    for (const k of allKeys) {
      const cell = cellStates[k] || (cellStates.get ? cellStates.get(k) : null)
      if (cell === null || cell === undefined) {
        empty++
      } else {
        if (empty > 0) { result += String(empty); empty = 0 }
        result += symbolMap.toSymbol(cell)
      }
    }
    if (empty > 0) result += String(empty)
    return result
  }

  function parsePosition(notation, vocabulary) {
    const symbolMap = buildHexSymbolMap(vocabulary)
    const cellStates = {}

    if (shape === 'rhombus' && size) {
      const rowStrings = notation.split('/')
      for (let r = 0; r < rowStrings.length && r < size; r++) {
        let q = 0
        for (const ch of rowStrings[r]) {
          if (ch >= '0' && ch <= '9') {
            q += parseInt(ch, 10)
          } else {
            const piece = symbolMap.fromSymbol(ch)
            if (piece) cellStates[key(q, r)] = piece
            q++
          }
        }
      }
    } else {
      const allKeys = getAllCells().sort()
      let idx = 0
      for (const ch of notation) {
        if (ch >= '0' && ch <= '9') {
          idx += parseInt(ch, 10)
        } else {
          const piece = symbolMap.fromSymbol(ch)
          if (piece && idx < allKeys.length) {
            cellStates[allKeys[idx]] = piece
          }
          idx++
        }
      }
    }
    return cellStates
  }

  function buildHexSymbolMap(vocabulary) {
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

  return {
    radius,
    size: cells.size,
    shape,
    boardSize: size || null,
    orientation,
    isValid,
    neighbours,
    distance,
    ring,
    lineOfSight,
    ray,
    rays,
    leapTargets,
    jumpPairs,
    adjacentPairs,
    toJSON,
    fromJSON,
    toPixel,
    getCorners,
    getAllCells,
    getCellCount,
    getRing,
    getDirections(category) {
      return DIRECTION_CATEGORIES[category] || []
    },
    getLayout,
    serializePosition,
    parsePosition,
    DIRECTIONS,
  }
}
