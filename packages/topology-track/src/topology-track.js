export const schema = {
  type: 'track',
  required: ['positions'],
  parseBoard(board) {
    const match = board.match(/(\d+)/)
    if (!match) return null
    return { type: 'track', positions: parseInt(match[1], 10) }
  },
  matchBoard(board) {
    return /\d+[- ]point/i.test(board)
  },
}

export function createTrackTopology(config) {
  const { positions, circuit = false, branches = {} } = config
  const posMap = new Map()

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const name = typeof pos === 'string' ? pos : pos.name
    const meta = typeof pos === 'string' ? {} : pos
    posMap.set(name, { index: i, name, ...meta })
  }

  function isValid(name) {
    return posMap.has(name)
  }

  function getIndex(name) {
    const pos = posMap.get(name)
    return pos ? pos.index : -1
  }

  function getName(index) {
    if (index < 0 || index >= positions.length) return null
    const pos = positions[index]
    return typeof pos === 'string' ? pos : pos.name
  }

  function next(name, steps = 1, opts = {}) {
    const { direction = 1, player } = opts
    let idx = getIndex(name)
    if (idx === -1) return null

    for (let i = 0; i < steps; i++) {
      const branchKey = player ? `${getName(idx)}:${player}` : null
      if (branchKey && branches[branchKey]) {
        idx = getIndex(branches[branchKey])
        if (idx === -1) return null
        continue
      }

      idx += direction
      if (circuit) {
        idx = ((idx % positions.length) + positions.length) % positions.length
      } else if (idx < 0 || idx >= positions.length) {
        return null
      }
    }
    return getName(idx)
  }

  function previous(name, steps = 1, opts = {}) {
    return next(name, steps, { ...opts, direction: -1 })
  }

  function distance(from, to) {
    const fromIdx = getIndex(from)
    const toIdx = getIndex(to)
    if (fromIdx === -1 || toIdx === -1) return -1

    if (!circuit) return Math.abs(toIdx - fromIdx)

    const forward = ((toIdx - fromIdx) + positions.length) % positions.length
    const backward = ((fromIdx - toIdx) + positions.length) % positions.length
    return Math.min(forward, backward)
  }

  function forwardDistance(from, to) {
    const fromIdx = getIndex(from)
    const toIdx = getIndex(to)
    if (fromIdx === -1 || toIdx === -1) return -1
    if (circuit) return ((toIdx - fromIdx) + positions.length) % positions.length
    return toIdx - fromIdx
  }

  function neighbours(name) {
    const idx = getIndex(name)
    if (idx === -1) return []
    const result = []
    if (idx > 0 || circuit) {
      const prevIdx = circuit ? (idx - 1 + positions.length) % positions.length : idx - 1
      result.push(getName(prevIdx))
    }
    if (idx < positions.length - 1 || circuit) {
      const nextIdx = circuit ? (idx + 1) % positions.length : idx + 1
      result.push(getName(nextIdx))
    }
    return result
  }

  function getRange(from, steps, direction = 1) {
    const results = []
    let current = from
    for (let i = 0; i < steps; i++) {
      current = next(current, 1, { direction })
      if (current === null) break
      results.push(current)
    }
    return results
  }

  function getMeta(name) {
    return posMap.get(name) || null
  }

  function getAll() {
    return positions.map(p => typeof p === 'string' ? p : p.name)
  }

  function getCount() {
    return positions.length
  }

  function toJSON(name) {
    return name
  }

  function fromJSON(str) {
    return str
  }

  function isCircuit() {
    return circuit
  }

  function getLayout(opts = {}) {
    const { cellSize = 40, style = 'linear' } = opts
    const all = getAll()

    return {
      getDimensions() {
        if (circuit && style === 'circuit') {
          const side = Math.ceil(all.length / 4)
          const dim = (side + 1) * cellSize
          return { width: dim, height: dim }
        }
        return { width: all.length * cellSize, height: cellSize * 2 }
      },
      getCells() {
        const cells = []
        if (circuit && style === 'circuit') {
          const side = Math.ceil(all.length / 4)
          const dim = (side + 1) * cellSize
          let idx = 0
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push({ key: all[idx++], center: { x: i * cellSize + cellSize / 2, y: cellSize / 2 }, shape: 'rect', size: cellSize * 0.85 })
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push({ key: all[idx++], center: { x: dim - cellSize / 2, y: i * cellSize + cellSize / 2 }, shape: 'rect', size: cellSize * 0.85 })
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push({ key: all[idx++], center: { x: dim - i * cellSize - cellSize / 2, y: dim - cellSize / 2 }, shape: 'rect', size: cellSize * 0.85 })
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push({ key: all[idx++], center: { x: cellSize / 2, y: dim - i * cellSize - cellSize / 2 }, shape: 'rect', size: cellSize * 0.85 })
        } else {
          for (let i = 0; i < all.length; i++)
            cells.push({ key: all[i], center: { x: i * cellSize + cellSize / 2, y: cellSize }, shape: 'rect', size: cellSize * 0.85 })
        }
        return cells
      },
      getLines() {
        const cells = this.getCells()
        const lines = []
        for (let i = 0; i < cells.length - 1; i++)
          lines.push({ x1: cells[i].center.x, y1: cells[i].center.y, x2: cells[i + 1].center.x, y2: cells[i + 1].center.y })
        if (circuit && cells.length > 1)
          lines.push({ x1: cells[cells.length - 1].center.x, y1: cells[cells.length - 1].center.y, x2: cells[0].center.x, y2: cells[0].center.y })
        return lines
      },
    }
  }

  return {
    isValid,
    getIndex,
    getName,
    next,
    previous,
    distance,
    forwardDistance,
    neighbours,
    getRange,
    getMeta,
    getAll,
    getCount,
    toJSON,
    fromJSON,
    isCircuit,
    getLayout,
  }
}
