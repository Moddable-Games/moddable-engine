/**
 * Vocabulary symbols longer than one character.
 *
 * Dai Shogi needs 29 piece types on one board and addresses them as two-letter
 * codes. Both serialisers wrote them raw, so `LN` read back as an `L` and an
 * `N`: a fifteen-file row serialised to thirty tokens, and the position that
 * came back was not the position that went out. It went unnoticed because no
 * playable variant had a multi-character vocabulary until Dai became playable.
 *
 * There are two writers, and they had the same bug independently, so both are
 * asserted here rather than whichever one a caller happens to reach.
 */
import { boardToSetup } from '../src/serialise.js'
import '../test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../src/play.js'
import { toFen, loadFen } from '../src/fen.js'

const vocabulary = {
  lance: { symbols: { 0: 'LN', 1: 'ln' } },
  knight: { symbols: { 0: 'KN', 1: 'kn' } },
  pawn: { symbols: { 0: 'P', 1: 'p' } },
}

const cell = (type, owner) => ({ type, owner })

describe('boardToSetup brackets multi-character symbols', () => {
  it('brackets a two-character code and leaves a one-character code bare', () => {
    const board = [cell('lance', 0), cell('pawn', 0), cell('knight', 1), null]
    expect(boardToSetup({ board }, { rows: 2, cols: 2 }, vocabulary))
      .toBe('[LN]P/[kn]1')
  })

  it('keeps each row the width of the board', () => {
    const board = [cell('lance', 0), cell('knight', 0), cell('lance', 1), cell('knight', 1)]
    const fen = boardToSetup({ board }, { rows: 2, cols: 2 }, vocabulary)
    for (const row of fen.split('/')) {
      const width = (row.match(/\[[^\]]+\]|\d+|[^\d]/g) || [])
        .reduce((n, t) => n + (/^\d+$/.test(t) ? Number(t) : 1), 0)
      expect(width).toBe(2)
    }
  })

  it('is unchanged for a single-character vocabulary', () => {
    const board = [cell('pawn', 0), null, null, cell('pawn', 1)]
    expect(boardToSetup({ board }, { rows: 2, cols: 2 }, vocabulary)).toBe('P1/1p')
  })
})

describe('toFen round-trips a multi-character vocabulary', () => {
  const occupied = (game) =>
    (game.getState().slice.board || []).filter(c => c !== null && c !== undefined).length

  it('exports and re-imports Dai Shogi to the same position', () => {
    const game = createGameForFamily('shogi', { variant: 'dai-shogi', rngSeed: 3 })
    const before = occupied(game)
    expect(before).toBe(130)

    const fen = toFen(game)
    expect(fen).toContain('[')

    const reloaded = createGameForFamily('shogi', { variant: 'dai-shogi', rngSeed: 3 })
    loadFen(reloaded, fen)
    expect(occupied(reloaded)).toBe(before)
    expect(toFen(reloaded).split(' ')[0]).toBe(fen.split(' ')[0])
  })

  it('gives every row the width of the board', () => {
    const game = createGameForFamily('shogi', { variant: 'dai-shogi', rngSeed: 3 })
    for (const row of toFen(game).split(' ')[0].split('/')) {
      const width = (row.match(/\[[^\]]+\]|\d+|\+|[^\d]/g) || [])
        .filter(t => t !== '+')
        .reduce((n, t) => n + (/^\d+$/.test(t) ? Number(t) : 1), 0)
      expect(width).toBe(15)
    }
  })
})
