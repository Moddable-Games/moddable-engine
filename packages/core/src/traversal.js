/**
 * Topology-agnostic traversal algorithms.
 *
 * Each function accepts a `getNeighbours(coord)` function rather than a
 * topology instance — this keeps the module decoupled and testable. Topology
 * packages bind these by passing their own `neighbours` method.
 */

export function floodFill(start, predicate, getNeighbours) {
  const visited = new Set()
  const queue = [start]
  visited.add(start)

  while (queue.length > 0) {
    const current = queue.shift()
    for (const n of getNeighbours(current)) {
      if (visited.has(n)) continue
      if (!predicate(n)) continue
      visited.add(n)
      queue.push(n)
    }
  }
  return visited
}

export function getGroup(start, predicate, getNeighbours) {
  const group = new Set()
  const boundary = new Set()
  const queue = [start]
  group.add(start)

  while (queue.length > 0) {
    const current = queue.shift()
    for (const n of getNeighbours(current)) {
      if (group.has(n)) continue
      if (predicate(n)) {
        group.add(n)
        queue.push(n)
      } else {
        boundary.add(n)
      }
    }
  }
  return { group, boundary }
}

export function hasPath(startSet, endPredicate, traversePredicate, getNeighbours) {
  const visited = new Set(startSet)
  const queue = [...startSet]

  while (queue.length > 0) {
    const current = queue.shift()
    if (endPredicate(current)) return true
    for (const n of getNeighbours(current)) {
      if (visited.has(n)) continue
      if (!traversePredicate(n)) continue
      visited.add(n)
      queue.push(n)
    }
  }
  return false
}

export function findPatterns(cells, patterns, getOccupant, player, getNeighbours) {
  const matches = []

  for (const pattern of patterns) {
    const found = matchPattern(cells, pattern, getOccupant, player, getNeighbours)
    matches.push(...found)
  }
  return matches
}

function matchPattern(cells, pattern, getOccupant, player, getNeighbours) {
  const matches = []

  if (pattern.type === 'line') {
    for (const cell of cells) {
      const occupant = getOccupant(cell)
      if (occupant !== player) continue
      const lines = findLines(cell, pattern.length, getOccupant, player, getNeighbours)
      for (const line of lines) {
        matches.push({ pattern: pattern.id || pattern.type, cells: line })
      }
    }
  } else if (pattern.type === 'group') {
    const visited = new Set()
    for (const cell of cells) {
      if (visited.has(cell)) continue
      const occupant = getOccupant(cell)
      if (occupant !== player) continue
      const { group } = getGroup(cell, c => getOccupant(c) === player, getNeighbours)
      if (group.size >= pattern.minSize) {
        matches.push({ pattern: pattern.id || pattern.type, cells: [...group] })
      }
      for (const g of group) visited.add(g)
    }
  }

  return matches
}

function findLines(start, length, getOccupant, player, getNeighbours) {
  const lines = []
  const neighbours = getNeighbours(start)

  for (const next of neighbours) {
    if (getOccupant(next) !== player) continue
    const line = [start, next]
    let current = next
    let prev = start

    while (line.length < length) {
      const nextNeighbours = getNeighbours(current)
      const continuation = nextNeighbours.find(n =>
        n !== prev && getOccupant(n) === player && isCollinear(prev, current, n, getNeighbours)
      )
      if (continuation === undefined) break
      line.push(continuation)
      prev = current
      current = continuation
    }

    if (line.length >= length) {
      const key = [...line].sort((a, b) => a - b).join(',')
      if (!lines.some(l => [...l].sort((a, b) => a - b).join(',') === key)) {
        lines.push(line)
      }
    }
  }
  return lines
}

function isCollinear(a, b, c, getNeighbours) {
  const bNeighbours = getNeighbours(b)
  return bNeighbours.includes(a) && bNeighbours.includes(c)
}
