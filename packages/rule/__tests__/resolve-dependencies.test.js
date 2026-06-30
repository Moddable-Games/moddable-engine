import { resolveOrder, validateTopologyNeeds } from '../index.js'

describe('resolve-dependencies', () => {
  describe('resolveOrder', () => {
    it('returns rules in dependency order', () => {
      const rules = [
        { id: 'checkmate', requires: ['check'] },
        { id: 'check', requires: ['attack-detection'] },
        { id: 'attack-detection', requires: [] },
      ]
      const ordered = resolveOrder(rules)
      const ids = ordered.map(r => r.id)
      expect(ids.indexOf('attack-detection')).toBeLessThan(ids.indexOf('check'))
      expect(ids.indexOf('check')).toBeLessThan(ids.indexOf('checkmate'))
    })

    it('handles rules with no dependencies', () => {
      const rules = [
        { id: 'a', requires: [] },
        { id: 'b', requires: [] },
        { id: 'c', requires: [] },
      ]
      const ordered = resolveOrder(rules)
      expect(ordered).toHaveLength(3)
    })

    it('handles diamond dependencies', () => {
      const rules = [
        { id: 'd', requires: ['b', 'c'] },
        { id: 'b', requires: ['a'] },
        { id: 'c', requires: ['a'] },
        { id: 'a', requires: [] },
      ]
      const ordered = resolveOrder(rules)
      const ids = ordered.map(r => r.id)
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'))
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'))
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'))
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'))
    })

    it('throws on circular dependency', () => {
      const rules = [
        { id: 'a', requires: ['b'] },
        { id: 'b', requires: ['a'] },
      ]
      expect(() => resolveOrder(rules)).toThrow(/Circular dependency/)
    })

    it('throws on missing dependency', () => {
      const rules = [
        { id: 'a', requires: ['nonexistent'] },
      ]
      expect(() => resolveOrder(rules)).toThrow(/requires "nonexistent"/)
    })

    it('treats missing requires as empty array', () => {
      const rules = [{ id: 'no-deps' }]
      const ordered = resolveOrder(rules)
      expect(ordered).toHaveLength(1)
      expect(ordered[0].id).toBe('no-deps')
    })

    it('preserves rule objects through sort', () => {
      const rules = [
        { id: 'b', requires: ['a'], hooks: { init: () => 'b' } },
        { id: 'a', requires: [], hooks: { init: () => 'a' } },
      ]
      const ordered = resolveOrder(rules)
      expect(ordered[0].hooks.init()).toBe('a')
      expect(ordered[1].hooks.init()).toBe('b')
    })
  })

  describe('validateTopologyNeeds', () => {
    it('passes when topology provides needed methods', () => {
      const rules = [{ id: 'r', topologyNeeds: ['neighbours', 'rays'] }]
      const topology = { neighbours: () => {}, rays: () => {} }
      expect(() => validateTopologyNeeds(rules, topology)).not.toThrow()
    })

    it('throws when topology is missing a needed method', () => {
      const rules = [{ id: 'r', topologyNeeds: ['sowSequence'] }]
      const topology = { neighbours: () => {} }
      expect(() => validateTopologyNeeds(rules, topology)).toThrow(/sowSequence/)
    })

    it('throws when topology is null but methods are needed', () => {
      const rules = [{ id: 'r', topologyNeeds: ['neighbours'] }]
      expect(() => validateTopologyNeeds(rules, null)).toThrow(/neighbours/)
    })

    it('passes with no topology needs', () => {
      const rules = [{ id: 'r', topologyNeeds: [] }]
      expect(() => validateTopologyNeeds(rules, null)).not.toThrow()
    })

    it('passes with missing topologyNeeds field', () => {
      const rules = [{ id: 'r' }]
      expect(() => validateTopologyNeeds(rules, null)).not.toThrow()
    })
  })
})
