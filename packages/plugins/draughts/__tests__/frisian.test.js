import { createDraughtsPlugin } from '../index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#161. Frisian is International Draughts with three rules on top, and
// each was load-bearing: capture in all eight directions while movement stays
// diagonal, a weighted majority that is a value sum rather than a piece count,
// and a limit on consecutive quiet king moves.
//
// Positions are built by hand from the rules text.

const COLS = 10
const at = (r, c) => r * COLS + c
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const FRISIAN = {
  rows: 10, cols: 10, piecesPerPlayer: 20,
  directions: 'diagonal', captureDirections: 'all', manCapture: 'all',
  flyingKings: true, forcedCapture: true,
  maximalCapture: 'weighted', majorityPrefersKing: true,
  removeImmediately: false, kingMoveLimit: 3,
}

function position(cells, config = FRISIAN) {
  const plugin = createDraughtsPlugin(config)
  const slice = plugin.init({}, { request: () => null })
  slice.board = new Array(100).fill(null)
  for (const [index, piece] of Object.entries(cells)) slice.board[index] = piece
  return { plugin, slice }
}

const man = (owner = 0) => ({ type: 'man', owner })
const king = (owner = 0) => ({ type: 'king', owner })

describe('frisian (engine#161)', () => {
  it('captures orthogonally, which no other variant in the family does', () => {
    // White man on e5 with a black man directly above it and an empty square
    // beyond: a straight-up jump, impossible on a diagonal-only board.
    const { plugin, slice } = position({ [at(5, 4)]: man(0), [at(4, 4)]: man(1) })
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.some(m => m.from === at(5, 4) && m.to === at(3, 4))).toBe(true)
  })

  it('still moves only on the diagonals', () => {
    const { plugin, slice } = position({ [at(5, 4)]: man(0) })
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) {
      const dr = Math.trunc(m.to / COLS) - Math.trunc(m.from / COLS)
      const dc = (m.to % COLS) - (m.from % COLS)
      expect(Math.abs(dr)).toBe(Math.abs(dc))
    }
  })

  it('prefers two men and a king over three men', () => {
    // Left: a chain of three enemy men. Right: two men and a king. 3 against
    // 3.5, so only the right-hand sequence is offered.
    const { plugin, slice } = position({
      [at(9, 0)]: man(0),
      [at(8, 0)]: man(1), [at(6, 0)]: man(1), [at(4, 0)]: man(1),
      [at(9, 5)]: man(0),
      [at(8, 5)]: man(1), [at(6, 5)]: king(1), [at(4, 5)]: man(1),
    })
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.from === at(9, 5))).toBe(true)
  })

  it('counts pieces instead when the variant does not ask for weight', () => {
    const plain = { ...FRISIAN, maximalCapture: true }
    const { plugin, slice } = position({
      [at(9, 0)]: man(0),
      [at(8, 0)]: man(1), [at(6, 0)]: man(1), [at(4, 0)]: man(1),
      [at(9, 5)]: man(0),
      [at(8, 5)]: man(1), [at(6, 5)]: king(1), [at(4, 5)]: man(1),
    }, plain)
    // Three men beats two men and a king once a king is only worth one.
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.some(m => m.from === at(9, 0))).toBe(true)
  })

  it('stops a king after three consecutive quiet moves', () => {
    const { plugin, slice } = position({ [at(5, 5)]: king(0), [at(9, 9)]: man(0) })
    slice._kingStreak = [{ at: at(5, 5), count: 3 }, null]
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.some(m => m.from === at(5, 5))).toBe(false)
    // The man may still move, which is what releases the king.
    expect(moves.some(m => m.from === at(9, 9))).toBe(true)
  })

  it('does not restrict a player who has only kings left', () => {
    const { plugin, slice } = position({ [at(5, 5)]: king(0) })
    slice._kingStreak = [{ at: at(5, 5), count: 5 }, null]
    expect(plugin.getLegalMoves(slice, turn(0)).some(m => m.from === at(5, 5))).toBe(true)
  })

  it('counts a streak up and breaks it when another piece moves', () => {
    const { plugin, slice } = position({ [at(5, 5)]: king(0), [at(9, 9)]: man(0) })
    const first = plugin.applyMove({ from: at(5, 5), to: at(4, 4) }, slice, turn(0))
    expect(first._kingStreak[0]).toEqual({ at: at(4, 4), count: 1 })
    const second = plugin.applyMove({ from: at(4, 4), to: at(3, 3) }, first, turn(0))
    expect(second._kingStreak[0]).toEqual({ at: at(3, 3), count: 2 })
    const other = plugin.applyMove({ from: at(9, 9), to: at(8, 8) }, second, turn(0))
    expect(other._kingStreak[0]).toBe(null)
  })

  it('plays a whole game from the corpus and reaches a terminal position', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('draughts', { variant: 'frisian', rngSeed: seed })
      const rng = createRng(seed)
      let outcome = 'timeout'
      for (let i = 0; i < 600; i++) {
        const moves = game.getLegalMoves()
        if (!moves.length) { outcome = 'no-moves'; break }
        const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok) { outcome = 'rejected'; break }
        if (result.winner !== undefined && result.winner !== null) { outcome = `winner:${result.winner}`; break }
      }
      expect(outcome).not.toBe('timeout')
      expect(outcome).not.toBe('rejected')
    }
  })
})
