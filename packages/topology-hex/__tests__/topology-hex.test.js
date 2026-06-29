import { createHexTopology } from '../src/topology-hex.js'

describe('topology-hex', () => {
  const hex = createHexTopology({ radius: 3 })

  test('cell count for radius 3 is 37 (1+6+12+18)', () => {
    expect(hex.getCellCount()).toBe(37)
  })

  test('center cell is valid', () => {
    expect(hex.isValid({ q: 0, r: 0 })).toBe(true)
    expect(hex.isValid('0,0')).toBe(true)
  })

  test('edge cell is valid', () => {
    expect(hex.isValid({ q: 3, r: 0 })).toBe(true)
    expect(hex.isValid({ q: -3, r: 0 })).toBe(true)
  })

  test('out-of-bounds cell is invalid', () => {
    expect(hex.isValid({ q: 4, r: 0 })).toBe(false)
    expect(hex.isValid({ q: 10, r: 10 })).toBe(false)
  })

  test('center has 6 neighbours', () => {
    expect(hex.neighbours({ q: 0, r: 0 })).toHaveLength(6)
  })

  test('edge cell has fewer than 6 neighbours', () => {
    const n = hex.neighbours({ q: 3, r: 0 })
    expect(n.length).toBeLessThan(6)
  })

  test('neighbours are all valid cells', () => {
    const n = hex.neighbours({ q: 1, r: 1 })
    for (const k of n) {
      expect(hex.isValid(k)).toBe(true)
    }
  })

  test('distance from center to ring edge', () => {
    expect(hex.distance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3)
    expect(hex.distance({ q: 0, r: 0 }, { q: 0, r: -3 })).toBe(3)
    expect(hex.distance({ q: 0, r: 0 }, { q: -2, r: 2 })).toBe(2)
  })

  test('distance is symmetric', () => {
    const a = { q: 1, r: -1 }, b = { q: -2, r: 1 }
    expect(hex.distance(a, b)).toBe(hex.distance(b, a))
  })

  test('distance to self is 0', () => {
    expect(hex.distance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0)
  })

  test('ring(0) returns center only', () => {
    expect(hex.ring(0)).toEqual(['0,0'])
  })

  test('ring(1) returns 6 cells', () => {
    expect(hex.ring(1)).toHaveLength(6)
  })

  test('ring(2) returns 12 cells', () => {
    expect(hex.ring(2)).toHaveLength(12)
  })

  test('ring(3) returns 18 cells', () => {
    expect(hex.ring(3)).toHaveLength(18)
  })

  test('getRing identifies cell ring', () => {
    expect(hex.getRing({ q: 0, r: 0 })).toBe(0)
    expect(hex.getRing({ q: 1, r: 0 })).toBe(1)
    expect(hex.getRing({ q: 2, r: -1 })).toBe(2)
  })

  test('toJSON/fromJSON round-trip', () => {
    const coord = { q: 2, r: -1 }
    const json = hex.toJSON(coord)
    expect(hex.fromJSON(json)).toEqual(coord)
  })

  test('toPixel pointy-top produces expected values', () => {
    const p = hex.toPixel({ q: 0, r: 0 }, 10)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0)
  })

  test('toPixel non-center has non-zero coordinates', () => {
    const p = hex.toPixel({ q: 1, r: 0 }, 10)
    expect(p.x).toBeGreaterThan(0)
    expect(p.y).toBeCloseTo(0)
  })

  test('flat-top orientation changes pixel layout', () => {
    const flat = createHexTopology({ radius: 3, orientation: 'flat' })
    const p = flat.toPixel({ q: 1, r: 0 }, 10)
    expect(p.x).toBeCloseTo(15)
    expect(p.y).toBeCloseTo(8.66, 1)
  })

  test('getCorners returns 6 points', () => {
    const corners = hex.getCorners({ x: 0, y: 0 }, 10)
    expect(corners).toHaveLength(6)
  })

  test('lineOfSight returns cells between two points', () => {
    const los = hex.lineOfSight({ q: 0, r: 0 }, { q: 3, r: 0 })
    expect(los).toHaveLength(3)
    expect(los[0]).toBe('1,0')
    expect(los[1]).toBe('2,0')
    expect(los[2]).toBe('3,0')
  })

  test('ray returns cells in one direction until edge', () => {
    const r = hex.ray({ q: 0, r: 0 }, 0)
    expect(r).toHaveLength(3)
    expect(r[0]).toBe('1,0')
    expect(r[2]).toBe('3,0')
  })

  test('ray with maxSteps limits range', () => {
    const r = hex.ray({ q: 0, r: 0 }, 0, 1)
    expect(r).toHaveLength(1)
  })

  test('getAllCells returns all cells as keys', () => {
    const all = hex.getAllCells()
    expect(all).toHaveLength(37)
    expect(all).toContain('0,0')
    expect(all).toContain('3,0')
  })
})
