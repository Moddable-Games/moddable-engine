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
  }
}
