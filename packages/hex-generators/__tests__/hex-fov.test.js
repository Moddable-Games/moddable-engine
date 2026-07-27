import { computeFov } from '../src/hex-fov.js'

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

describe('computeFov', () => {
  const grid = makeGrid(4)

  it('returns null for origin not in hex list', () => {
    const result = computeFov(grid, { q: 99, r: 99 })
    expect(result).toBeNull()
  })

  it('origin is always visible at distance 0', () => {
    const result = computeFov(grid, { q: 0, r: 0 }, { range: 3 })
    const origin = result.visible.find(h => h.q === 0 && h.r === 0)
    expect(origin).toBeDefined()
    expect(origin.distance).toBe(0)
  })

  it('all hexes within range are visible with no blockers', () => {
    const result = computeFov(grid, { q: 0, r: 0 }, { range: 2 })
    expect(result.blocked.length).toBe(0)
    expect(result.visible.length).toBe(19)
  })

  it('respects range limit', () => {
    const result = computeFov(grid, { q: 0, r: 0 }, { range: 1 })
    expect(result.visible.every(h => h.distance <= 1)).toBe(true)
  })

  it('blocking terrain creates blocked hexes', () => {
    const hexes = [
      { q: 0, r: 0, type: 'plains' },
      { q: 1, r: 0, type: 'mountain' },
      { q: 2, r: 0, type: 'plains' },
    ]
    const result = computeFov(hexes, { q: 0, r: 0 }, { range: 3, blocking: ['mountain'] })
    const far = result.blocked.find(h => h.q === 2 && h.r === 0)
    expect(far).toBeDefined()
  })

  it('non-blocking terrain does not block', () => {
    const hexes = [
      { q: 0, r: 0, type: 'plains' },
      { q: 1, r: 0, type: 'forest' },
      { q: 2, r: 0, type: 'plains' },
    ]
    const result = computeFov(hexes, { q: 0, r: 0 }, { range: 3, blocking: ['mountain'] })
    expect(result.blocked.length).toBe(0)
  })

  it('returns correct structure', () => {
    const result = computeFov(grid, { q: 0, r: 0 }, { range: 2 })
    expect(result.origin).toEqual({ q: 0, r: 0 })
    expect(result.range).toBe(2)
    expect(result.blocking).toEqual([])
    expect(Array.isArray(result.visible)).toBe(true)
    expect(Array.isArray(result.blocked)).toBe(true)
  })

  it('each visible hex includes type and distance', () => {
    const result = computeFov(grid, { q: 0, r: 0 }, { range: 2 })
    for (const h of result.visible) {
      expect(h).toHaveProperty('q')
      expect(h).toHaveProperty('r')
      expect(h).toHaveProperty('type')
      expect(h).toHaveProperty('distance')
    }
  })

  it('defaults range to 3', () => {
    const result = computeFov(grid, { q: 0, r: 0 })
    const maxDist = Math.max(...result.visible.map(h => h.distance))
    expect(maxDist).toBe(3)
  })
})
