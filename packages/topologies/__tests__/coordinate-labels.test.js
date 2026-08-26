import { fileLabel, fileIndex, intersectionLabel, intersectionIndex } from '../../core/index.js'
import { algebraicId, algebraicToIndex, intersectionId } from '../grid/index.js'

// engine#138. Every one of these was `String.fromCharCode(97 + c)`, correct for
// 26 columns and silently wrong past them: column 26 gave '{', then '|', '}',
// '~', then non-printable control characters. The intersection alphabet was a
// 19-character string indexed directly, so column 19 evaluated
// `undefined + <number>` and every cell past the nineteenth got the id NaN.
//
// No test referenced any of the three id functions, and no fixture exceeded 19
// columns, so neither cliff was ever exercised.

describe('file labels', () => {
  it('matches the familiar single letters', () => {
    expect([0, 8, 25].map(fileLabel)).toEqual(['a', 'i', 'z'])
  })

  it('spills to two letters instead of punctuation', () => {
    expect([26, 27, 51, 52].map(fileLabel)).toEqual(['aa', 'ab', 'az', 'ba'])
  })

  it('round-trips every index a board could plausibly use', () => {
    const broken = []
    for (let i = 0; i < 4096; i++) if (fileIndex(fileLabel(i)) !== i) broken.push(i)
    expect(broken).toEqual([])
  })

  it('produces only printable ASCII, however wide the board', () => {
    const bad = []
    for (let i = 0; i < 4096; i++) if (!/^[a-z]+$/.test(fileLabel(i))) bad.push(i)
    expect(bad).toEqual([])
  })

  it('rejects a malformed label rather than guessing', () => {
    expect(fileIndex('')).toBe(-1)
    expect(fileIndex('a1')).toBe(-1)
    expect(fileIndex('{')).toBe(-1)
  })
})

describe('intersection labels', () => {
  it('skips i, as Go boards do', () => {
    expect([0, 7, 8, 18].map(intersectionLabel)).toEqual(['a', 'h', 'j', 't'])
  })

  it('extends past the nineteenth line instead of returning NaN', () => {
    expect([19, 20].map(intersectionLabel)).toEqual(['aa', 'ab'])
    for (let i = 0; i < 400; i++) {
      expect(intersectionLabel(i)).toMatch(/^[a-z]+$/)
      expect(intersectionIndex(intersectionLabel(i))).toBe(i)
    }
  })
})

describe('cell ids on boards wider than the alphabet', () => {
  // taikyoku-shogi is 36x36 and ships in the corpus. Its last ten files used to
  // be DEL and C1 control characters, which render as nothing.
  it.each([8, 19, 25, 36, 64])('a %ix%i board gives every cell a usable, unique id', (n) => {
    const ids = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) ids.push(algebraicId(r, c, n))
    expect(ids).toHaveLength(n * n)
    expect(new Set(ids).size).toBe(n * n)
    for (const id of ids) expect(id).toMatch(/^[a-z]+\d+$/)
  })

  it.each([8, 19, 25, 36, 64])('a %ix%i board round-trips every id back to its index', (n) => {
    const broken = []
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (algebraicToIndex(algebraicId(r, c, n), n, n) !== r * n + c) broken.push([r, c])
      }
    }
    expect(broken).toEqual([])
  })

  it.each([9, 19, 25, 38])('a %i-line intersection board gives every line a usable id', (n) => {
    const ids = []
    for (let c = 0; c < n; c++) ids.push(intersectionId(0, c, n))
    expect(new Set(ids).size).toBe(n)
    for (const id of ids) expect(id).toMatch(/^[a-z]+\d+$/)
  })
})
