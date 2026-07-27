import { pathfind } from '../src/hex-pathfind.js'

function makeGrid(radius) {
  const hexes = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) <= radius) {
        hexes.push({ q, r, type: 'plains' })
      }
    }
  }
  return hexes
}

describe('pathfind', () => {
  const grid = makeGrid(4)

  it('returns null if start is not in hex list', () => {
    const result = pathfind(grid, { q: 99, r: 99 }, { q: 0, r: 0 })
    expect(result).toBeNull()
  })

  it('returns null if end is not in hex list', () => {
    const result = pathfind(grid, { q: 0, r: 0 }, { q: 99, r: 99 })
    expect(result).toBeNull()
  })

  it('finds path between adjacent hexes', () => {
    const result = pathfind(grid, { q: 0, r: 0 }, { q: 1, r: 0 })
    expect(result.reachable).toBe(true)
    expect(result.distance).toBe(1)
    expect(result.path.length).toBe(2)
    expect(result.path[0]).toMatchObject({ q: 0, r: 0 })
    expect(result.path[1]).toMatchObject({ q: 1, r: 0 })
  })

  it('finds shortest path across grid', () => {
    const result = pathfind(grid, { q: -2, r: 0 }, { q: 2, r: 0 })
    expect(result.reachable).toBe(true)
    expect(result.distance).toBe(4)
  })

  it('path to self has distance 0', () => {
    const result = pathfind(grid, { q: 0, r: 0 }, { q: 0, r: 0 })
    expect(result.reachable).toBe(true)
    expect(result.distance).toBe(0)
    expect(result.path.length).toBe(1)
  })

  it('avoids impassable terrain', () => {
    const hexes = [
      { q: 0, r: 0, type: 'plains' },
      { q: 1, r: 0, type: 'mountain' },
      { q: 2, r: 0, type: 'plains' },
      { q: 0, r: 1, type: 'plains' },
      { q: 1, r: 1, type: 'plains' },
      { q: 1, r: -1, type: 'plains' },
      { q: 2, r: -1, type: 'plains' },
    ]
    const result = pathfind(hexes, { q: 0, r: 0 }, { q: 2, r: 0 }, { impassable: ['mountain'] })
    expect(result.reachable).toBe(true)
    expect(result.path.every(h => h.type !== 'mountain')).toBe(true)
    expect(result.distance).toBeGreaterThan(2)
  })

  it('returns unreachable when completely blocked', () => {
    const hexes = [
      { q: 0, r: 0, type: 'plains' },
      { q: 1, r: 0, type: 'wall' },
      { q: 0, r: 1, type: 'wall' },
      { q: -1, r: 1, type: 'wall' },
      { q: -1, r: 0, type: 'wall' },
      { q: 0, r: -1, type: 'wall' },
      { q: 1, r: -1, type: 'wall' },
      { q: 2, r: 0, type: 'plains' },
    ]
    const result = pathfind(hexes, { q: 0, r: 0 }, { q: 2, r: 0 }, { impassable: ['wall'] })
    expect(result.reachable).toBe(false)
    expect(result.path).toBeNull()
  })

  it('path includes type for each hex', () => {
    const result = pathfind(grid, { q: 0, r: 0 }, { q: 1, r: 0 })
    for (const h of result.path) {
      expect(h).toHaveProperty('type')
    }
  })

  it('returns from and to in result', () => {
    const from = { q: 0, r: 0 }
    const to = { q: 2, r: 0 }
    const result = pathfind(grid, from, to)
    expect(result.from).toEqual(from)
    expect(result.to).toEqual(to)
  })
})
