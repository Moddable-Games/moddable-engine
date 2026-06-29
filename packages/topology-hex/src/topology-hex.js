const DIRECTIONS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
]

export function createHexTopology(config) {
  const { radius, orientation = 'pointy' } = config
  const cells = new Map()
  generateGrid(radius, cells)

  function generateGrid(r, map) {
    for (let q = -r; q <= r; q++) {
      const r1 = Math.max(-r, -q - r)
      const r2 = Math.min(r, -q + r)
      for (let ri = r1; ri <= r2; ri++) {
        const ring = Math.max(Math.abs(q), Math.abs(ri), Math.abs(-q - ri))
        map.set(key(q, ri), { q, r: ri, ring })
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

  return {
    radius,
    orientation,
    isValid,
    neighbours,
    distance,
    ring,
    lineOfSight,
    ray,
    toJSON,
    fromJSON,
    toPixel,
    getCorners,
    getAllCells,
    getCellCount,
    getRing,
    DIRECTIONS,
  }
}
