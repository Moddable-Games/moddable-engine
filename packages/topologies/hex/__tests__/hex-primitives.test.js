import { createHexTopology } from '../src/topology-hex.js'

describe('hex topology piece-behaviour primitives', () => {
  const hex = createHexTopology({ radius: 4 })

  describe('rays', () => {
    it('returns 6 rays from centre with orthogonal', () => {
      const result = hex.rays('0,0', 'orthogonal')
      expect(result).toHaveLength(6)
      for (const ray of result) {
        expect(ray.length).toBeGreaterThan(0)
        for (const cell of ray) {
          expect(hex.isValid(cell)).toBe(true)
        }
      }
    })

    it('rays from centre reach the edge', () => {
      const result = hex.rays('0,0', 'orthogonal')
      const lengths = result.map(r => r.length)
      expect(Math.max(...lengths)).toBe(4)
    })

    it('respects maxSteps', () => {
      const result = hex.rays('0,0', 'orthogonal', 2)
      for (const ray of result) {
        expect(ray.length).toBeLessThanOrEqual(2)
      }
    })

    it('returns 6 rays from an off-centre cell', () => {
      const result = hex.rays('1,0', 'orthogonal')
      expect(result).toHaveLength(6)
    })

    it('rays from edge cell have shorter/empty rays in some directions', () => {
      const result = hex.rays('4,0', 'orthogonal')
      expect(result).toHaveLength(6)
      const nonEmpty = result.filter(r => r.length > 0)
      expect(nonEmpty.length).toBeLessThan(6)
    })
  })

  describe('leapTargets', () => {
    it('hex-knight offsets from centre produces valid targets', () => {
      const offsets = [
        { q: -2, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 1 },
        { q: 2, r: -1 }, { q: 1, r: -2 }, { q: -1, r: -1 },
      ]
      const targets = hex.leapTargets('0,0', offsets)
      expect(targets.length).toBeGreaterThan(0)
      for (const t of targets) {
        expect(hex.isValid(t)).toBe(true)
      }
    })

    it('accepts numeric range (distance-based leap)', () => {
      const targets = hex.leapTargets('0,0', 2)
      expect(targets.length).toBeGreaterThan(0)
      for (const t of targets) {
        expect(hex.isValid(t)).toBe(true)
        expect(hex.distance({ q: 0, r: 0 }, t)).toBe(2)
      }
    })

    it('accepts string category', () => {
      const targets = hex.leapTargets('0,0', 'knight')
      expect(Array.isArray(targets)).toBe(true)
    })

    it('leap from edge produces only valid cells', () => {
      const offsets = [{ q: 1, r: -2 }, { q: 2, r: -1 }, { q: -1, r: 2 }, { q: -2, r: 1 }]
      const targets = hex.leapTargets('4,0', offsets)
      for (const t of targets) {
        expect(hex.isValid(t)).toBe(true)
      }
    })
  })

  describe('jumpPairs', () => {
    it('returns {over, landing} objects from centre', () => {
      const pairs = hex.jumpPairs('0,0', [0, 1, 2, 3, 4, 5])
      expect(pairs.length).toBeGreaterThan(0)
      for (const pair of pairs) {
        expect(hex.isValid(pair.over)).toBe(true)
        expect(hex.isValid(pair.landing)).toBe(true)
        expect(pair.over).not.toBe(pair.landing)
      }
    })

    it('centre with radius 4 has 6 jump directions', () => {
      const pairs = hex.jumpPairs('0,0', [0, 1, 2, 3, 4, 5])
      expect(pairs).toHaveLength(6)
    })

    it('from edge, some directions have no jump', () => {
      const pairs = hex.jumpPairs('4,0', [0, 1, 2, 3, 4, 5])
      expect(pairs.length).toBeLessThan(6)
    })
  })

  describe('adjacentPairs', () => {
    it('returns {adjacent, far} objects from centre', () => {
      const pairs = hex.adjacentPairs('0,0', [0, 1, 2, 3, 4, 5])
      expect(pairs.length).toBeGreaterThan(0)
      for (const pair of pairs) {
        expect(hex.isValid(pair.adjacent)).toBe(true)
        expect(hex.isValid(pair.far)).toBe(true)
      }
    })

    it('centre with radius 4 has 6 adjacent pairs', () => {
      const pairs = hex.adjacentPairs('0,0', [0, 1, 2, 3, 4, 5])
      expect(pairs).toHaveLength(6)
    })

    it('from edge, some directions have no adjacent pair', () => {
      const pairs = hex.adjacentPairs('4,0', [0, 1, 2, 3, 4, 5])
      expect(pairs.length).toBeLessThan(6)
    })
  })
})
