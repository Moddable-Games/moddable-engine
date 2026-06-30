import { createStandardDice, standardDiceSchema } from '../index.js'
import { createRng } from '../../core/src/rng.js'

describe('component-dice: standard', () => {
  describe('schema', () => {
    it('declares type and componentType', () => {
      expect(standardDiceSchema.type).toBe('standard')
      expect(standardDiceSchema.componentType).toBe('dice')
    })
  })

  describe('createStandardDice()', () => {
    it('defaults to 2d6', () => {
      const dice = createStandardDice()
      expect(dice.count).toBe(2)
      expect(dice.faces).toBe(6)
    })

    it('accepts custom config', () => {
      const dice = createStandardDice({ count: 3, faces: 8 })
      expect(dice.count).toBe(3)
      expect(dice.faces).toBe(8)
    })
  })

  describe('roll()', () => {
    it('produces correct number of results', () => {
      const dice = createStandardDice()
      const rng = createRng(42)
      const results = dice.roll(rng)
      expect(results).toHaveLength(2)
    })

    it('results are within face range', () => {
      const dice = createStandardDice()
      const rng = createRng(99)
      for (let i = 0; i < 50; i++) {
        const results = dice.roll(rng)
        results.forEach(r => {
          expect(r).toBeGreaterThanOrEqual(1)
          expect(r).toBeLessThanOrEqual(6)
        })
      }
    })

    it('seeded RNG produces deterministic rolls', () => {
      const dice = createStandardDice()
      const rng1 = createRng(42)
      const rng2 = createRng(42)
      expect(dice.roll(rng1)).toEqual(dice.roll(rng2))
    })
  })

  describe('isDoubles()', () => {
    it('detects doubles', () => {
      const dice = createStandardDice()
      expect(dice.isDoubles([3, 3])).toBe(true)
      expect(dice.isDoubles([6, 6])).toBe(true)
    })

    it('rejects non-doubles', () => {
      const dice = createStandardDice()
      expect(dice.isDoubles([3, 5])).toBe(false)
    })

    it('handles single die', () => {
      const dice = createStandardDice({ count: 1 })
      expect(dice.isDoubles([4])).toBe(false)
    })
  })

  describe('movesFromRoll()', () => {
    it('non-doubles: returns dice values as moves', () => {
      const dice = createStandardDice()
      expect(dice.movesFromRoll([3, 5])).toEqual([3, 5])
    })

    it('doubles: returns multiplied moves (backgammon pattern)', () => {
      const dice = createStandardDice()
      expect(dice.movesFromRoll([6, 6])).toEqual([6, 6, 6, 6])
    })

    it('custom multiplier', () => {
      const dice = createStandardDice({ doublesMultiplier: 3 })
      expect(dice.movesFromRoll([4, 4])).toEqual([4, 4, 4, 4, 4, 4])
    })
  })

  describe('utility methods', () => {
    const dice = createStandardDice()

    it('total() sums results', () => {
      expect(dice.total([3, 5])).toBe(8)
      expect(dice.total([6, 6])).toBe(12)
    })

    it('max() returns highest die', () => {
      expect(dice.max([2, 5])).toBe(5)
    })

    it('min() returns lowest die', () => {
      expect(dice.min([2, 5])).toBe(2)
    })
  })

  describe('3d6 configuration', () => {
    it('rolls 3 dice', () => {
      const dice = createStandardDice({ count: 3, faces: 6 })
      const rng = createRng(7)
      const results = dice.roll(rng)
      expect(results).toHaveLength(3)
      results.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(1)
        expect(r).toBeLessThanOrEqual(6)
      })
    })
  })
})
