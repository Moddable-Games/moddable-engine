/**
 * Bracketed multi-character piece codes.
 *
 * The Create page tokenised a setup string one character at a time, so the
 * large shogi variants - which need 29 or more piece types on one board and
 * address them as `[ln]`, `[kn]`, `[st]` - came apart into runs of unrelated
 * single-character pieces, and the round-trip lost the board entirely. Dai
 * Shogi was the first playable variant to use the notation, which is why this
 * went unnoticed: nothing in the corpus exercised it.
 */
import { parseSetup, buildSetup } from '../create-state.js'

const grid = { type: 'grid', rows: 2, cols: 3 }

describe('bracketed piece codes survive the Create page', () => {
  it('parses a bracketed code as one piece, not as its letters', () => {
    const placement = parseSetup('[ln]1[kn]/3', grid)
    expect(placement).toEqual({ '0,0': 'ln', '0,2': 'kn' })
  })

  it('writes a multi-character code back bracketed', () => {
    const state = { topology: grid, placement: { '0,0': 'ln', '0,2': 'kn' } }
    expect(buildSetup(state)).toBe('[ln]1[kn]/3')
  })

  it('round-trips a mixed row of bracketed and single-character codes', () => {
    const fen = '[ln]P[kn]/1p1'
    expect(buildSetup({ topology: grid, placement: parseSetup(fen, grid) })).toBe(fen)
  })

  it('still reads plain single-character FEN unchanged', () => {
    expect(parseSetup('p1k/3', grid)).toEqual({ '0,0': 'p', '0,2': 'k' })
  })

  it('rejects a bracketed row that overruns the board', () => {
    expect(parseSetup('[ln][kn][st][fl]/3', grid)).toBeNull()
  })
})
