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

// engine#118: the page kept its own setup reader, which could read neither a
// four-player board, nor a hex board's coordinates, nor a board of layers, so
// those variants could be loaded but nothing could be placed on them. It now
// reads and writes with core's readPosition and writePosition.
describe('every setup form the corpus uses can be placed on', () => {
  const four = { type: 'grid', rows: 2, cols: 4 }

  it('reads four-player comma ranks, and a seat-prefixed piece is one piece', () => {
    expect(parseSetup('1,yR,2/rK,3', four)).toEqual({ '0,1': 'yR', '1,0': 'rK' })
  })

  it('writes an edited four-player board back in the same form', () => {
    const state = { topology: four, placement: { '0,1': 'yR', '1,0': 'rK', '1,3': 'gQ' }, setupForm: { commas: true } }
    expect(buildSetup(state)).toBe('1,yR,2/rK,2,gQ')
  })

  it('reads a hex board by cell, where a cell id holds a comma', () => {
    expect(parseSetup('-1,0:q,-1,1:p,2,-2:K', { type: 'hex' })).toEqual({ '-1,0': 'q', '-1,1': 'p', '2,-2': 'K' })
  })

  it('reads a board of layers one board at a time, the second keyed by its layer', () => {
    const layered = { type: 'grid', rows: 2, cols: 2, layers: 2 }
    expect(parseSetup(['K1/2', '2/1k'], layered)).toEqual({ '0,0': 'K', '1,1,1': 'k' })
    expect(parseSetup('K1/2 | 2/1k', layered)).toEqual({ '0,0': 'K', '1,1,1': 'k' })
  })

  it('writes every layer, as a list', () => {
    const state = { topology: { type: 'grid', rows: 2, cols: 2, layers: 2 }, placement: { '0,0': 'K', '1,1,1': 'k' } }
    expect(buildSetup(state)).toEqual(['K1/2', '2/1k'])
  })

  it('keeps a promoted piece promoted, outside its brackets', () => {
    const placement = parseSetup('+[ln]2/3', grid)
    expect(placement).toEqual({ '0,0': '+ln' })
    expect(buildSetup({ topology: grid, placement })).toBe('+[ln]2/3')
  })

  it('writes a setup nobody touched back as it came, however else it could be written', () => {
    const placement = parseSetup('1,1,yR,1/4', four)
    const state = { topology: four, placement: { ...placement }, setupOriginal: { placement, setup: '1,1,yR,1/4' }, setupForm: { commas: true } }
    expect(buildSetup(state)).toBe('1,1,yR,1/4')
    state.placement['1,0'] = 'rK'
    expect(buildSetup(state)).toBe('2,yR,1/rK,3')
  })
})
