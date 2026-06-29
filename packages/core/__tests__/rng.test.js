import { createRng } from '../src/rng.js'

describe('rng', () => {
  test('same seed produces same sequence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  test('fromSeed resets to same sequence', () => {
    const rng = createRng(99)
    const first = Array.from({ length: 10 }, () => rng.next())
    rng.fromSeed(99)
    const second = Array.from({ length: 10 }, () => rng.next())
    expect(first).toEqual(second)
  })

  test('next returns values in [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  test('nextInt returns values in [min, max] inclusive', () => {
    const rng = createRng(5)
    const results = new Set()
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextInt(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      results.add(v)
    }
    expect(results.size).toBe(6)
  })

  test('nextChoice picks from array', () => {
    const rng = createRng(3)
    const items = ['a', 'b', 'c']
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.nextChoice(items))
    }
  })

  test('shuffle returns all elements', () => {
    const rng = createRng(1)
    const arr = [1, 2, 3, 4, 5]
    const shuffled = rng.shuffle(arr)
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5])
  })

  test('shuffle does not mutate original', () => {
    const rng = createRng(1)
    const arr = [1, 2, 3, 4, 5]
    rng.shuffle(arr)
    expect(arr).toEqual([1, 2, 3, 4, 5])
  })

  test('getSeed returns the current seed', () => {
    const rng = createRng(123)
    expect(rng.getSeed()).toBe(123)
  })

  test('different seeds produce different sequences', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })
})
