import { parseDiceExpression, rollDiceExpression } from '../src/dice-expression.js'
import { createRng } from '../../core/src/rng.js'

describe('parseDiceExpression', () => {
  test('parses constant number', () => {
    expect(parseDiceExpression(5)).toEqual({ type: 'constant', value: 5 })
    expect(parseDiceExpression('12')).toEqual({ type: 'constant', value: 12 })
  })

  test('parses basic dice', () => {
    expect(parseDiceExpression('3d6')).toEqual({
      type: 'dice', count: 3, faces: 6,
      keepHigh: null, keepLow: null, modifier: 0,
    })
  })

  test('parses keep highest', () => {
    expect(parseDiceExpression('4d6kh3')).toEqual({
      type: 'dice', count: 4, faces: 6,
      keepHigh: 3, keepLow: null, modifier: 0,
    })
  })

  test('parses keep lowest', () => {
    expect(parseDiceExpression('3d6kl1')).toEqual({
      type: 'dice', count: 3, faces: 6,
      keepHigh: null, keepLow: 1, modifier: 0,
    })
  })

  test('parses modifier', () => {
    expect(parseDiceExpression('2d6+6')).toEqual({
      type: 'dice', count: 2, faces: 6,
      keepHigh: null, keepLow: null, modifier: 6,
    })
    expect(parseDiceExpression('1d8-1')).toEqual({
      type: 'dice', count: 1, faces: 8,
      keepHigh: null, keepLow: null, modifier: -1,
    })
  })

  test('returns null for invalid expressions', () => {
    expect(parseDiceExpression('hello')).toBeNull()
    expect(parseDiceExpression('')).toBeNull()
  })
})

describe('rollDiceExpression', () => {
  test('returns constant value', () => {
    const rng = createRng(42)
    expect(rollDiceExpression(7, rng)).toBe(7)
    expect(rollDiceExpression('10', rng)).toBe(10)
  })

  test('rolls basic dice deterministically', () => {
    const rng1 = createRng(123)
    const rng2 = createRng(123)
    expect(rollDiceExpression('3d6', rng1)).toBe(rollDiceExpression('3d6', rng2))
  })

  test('3d6 result is in valid range', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const result = rollDiceExpression('3d6', rng)
      expect(result).toBeGreaterThanOrEqual(3)
      expect(result).toBeLessThanOrEqual(18)
    }
  })

  test('4d6kh3 result is in valid range', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const result = rollDiceExpression('4d6kh3', rng)
      expect(result).toBeGreaterThanOrEqual(3)
      expect(result).toBeLessThanOrEqual(18)
    }
  })

  test('3d6kl1 result is in valid range (1-6)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const result = rollDiceExpression('3d6kl1', rng)
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(6)
    }
  })

  test('2d6+6 result is in valid range (8-18)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const result = rollDiceExpression('2d6+6', rng)
      expect(result).toBeGreaterThanOrEqual(8)
      expect(result).toBeLessThanOrEqual(18)
    }
  })

  test('2d20+10 result is in valid range (12-50)', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed)
      const result = rollDiceExpression('2d20+10', rng)
      expect(result).toBeGreaterThanOrEqual(12)
      expect(result).toBeLessThanOrEqual(50)
    }
  })

  test('returns 0 for invalid expression', () => {
    const rng = createRng(42)
    expect(rollDiceExpression('nonsense', rng)).toBe(0)
  })
})
