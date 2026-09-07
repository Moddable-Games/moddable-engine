import { createShogiPlugin } from '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#160. Annan Shogi changes one thing: "each piece borrows the movement
// of the friendly piece immediately behind it". That makes move generation a
// function of the position rather than of the piece, which is why it could not
// be a piece definition.
//
// The borrow is not transitive - a piece takes the rear piece's OWN move, never
// the move the rear piece is itself borrowing.

const COLS = 9
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const ANNAN = {
  rows: 9, cols: 9, borrowFromBehind: true,
  noDropLastRank: [], noDropSecondRank: [],
}

function position(cells, config = ANNAN) {
  const plugin = createShogiPlugin(config)
  plugin.init({}, { request })
  const board = new Array(81).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, hands: [[], []], _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })
const targets = (plugin, slice, from, seat = 0) =>
  plugin.getLegalMoves(slice, turn(seat)).filter(m => m.from === from).map(m => m.to).sort((a, b) => a - b)

describe('annan shogi (engine#160)', () => {
  // Seat 0 advances up the board, so "behind" a piece at (r,c) is (r+1,c).
  it('gives a Pawn the Rook behind it', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: piece('pawn'), [at(5, 4)]: piece('rook'),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    const reach = targets(plugin, slice, at(4, 4))
    // A rook's file and rank, not a pawn's single step.
    expect(reach).toContain(at(0, 4))
    expect(reach).toContain(at(4, 0))
    expect(reach).toContain(at(4, 8))
    expect(reach.length).toBeGreaterThan(5)
  })

  it('leaves a piece with nothing behind it moving its own way', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: piece('pawn'),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    expect(targets(plugin, slice, at(4, 4))).toEqual([at(3, 4)])
  })

  it('does not borrow from an enemy piece behind it', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: piece('pawn'), [at(5, 4)]: piece('rook', 1),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    expect(targets(plugin, slice, at(4, 4))).toEqual([at(3, 4)])
  })

  it('gives back the piece’s own move the moment the rear piece leaves', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: piece('pawn'), [at(5, 4)]: piece('rook'),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    expect(targets(plugin, slice, at(4, 4)).length).toBeGreaterThan(1)
    const after = plugin.applyMove({ from: at(5, 4), to: at(5, 0) }, slice, turn(0))
    expect(targets(plugin, after, at(4, 4))).toEqual([at(3, 4)])
  })

  it('does not pass a borrowed move along a chain', () => {
    // Rook behind Silver behind Pawn. The Silver borrows the Rook; the Pawn
    // borrows the Silver's own move, not the Rook's.
    const { plugin, slice } = position({
      [at(3, 4)]: piece('pawn'), [at(4, 4)]: piece('silver'), [at(5, 4)]: piece('rook'),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    const pawnReach = targets(plugin, slice, at(3, 4))
    // A silver's five steps, and nothing down the file beyond them.
    expect(pawnReach).toContain(at(2, 3))
    expect(pawnReach).toContain(at(2, 5))
    expect(pawnReach).not.toContain(at(0, 4))
  })

  it('borrows for the other seat in the other direction', () => {
    // Seat 1 advances down, so behind its pawn at (4,4) is (3,4).
    const { plugin, slice } = position({
      [at(4, 4)]: piece('pawn', 1), [at(3, 4)]: piece('rook', 1),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    expect(targets(plugin, slice, at(4, 4), 1)).toContain(at(8, 4))
  })

  it('leaves an ordinary shogi variant generating exactly what it did', () => {
    const plain = position({
      [at(4, 4)]: piece('pawn'), [at(5, 4)]: piece('rook'),
      [at(8, 8)]: piece('king'), [at(0, 0)]: piece('king', 1),
    }, { rows: 9, cols: 9 })
    expect(targets(plain.plugin, plain.slice, at(4, 4))).toEqual([at(3, 4)])
  })

  it('plays the corpus variant to a terminal position', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('shogi', { variant: 'annan-shogi', rngSeed: seed })
      const rng = createRng(seed)
      let outcome = 'timeout'
      for (let i = 0; i < 400; i++) {
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
