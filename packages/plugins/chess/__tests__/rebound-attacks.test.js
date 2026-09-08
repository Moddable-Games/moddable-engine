import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#170. A rebounding Rook reported that it attacked nothing at all.
//
// `attacks` was derived from the move generator, and the move generator only
// records a capture where the board it is handed marks a piece `enemy`. The
// attack path is handed the RAW board, where nothing is marked - so every
// occupied square, king included, looked unattacked.
//
// Rollerball's Rooks and Bishops are both rebound riders, so nothing on the
// board defended either king: they could be walked into an attacked square and
// captured outright, which makes both of the game's win conditions - checkmate,
// and the King completing the circuit - unreachable. A real game ended with
// both kings taken and two bishops shuffling for ever.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)
const alg = (i) => 'abcdefg'[i % COLS] + (7 - Math.floor(i / COLS))

const game = () => createGameForFamily('chess', { variant: 'rollerball' })

function only(g, placements) {
  const slice = g.getState().slice
  const source = slice.board.slice()
  slice.board = slice.board.map(() => null)
  for (const [square, type, owner] of placements) {
    const template = source.find(p => p && p.type === type && p.owner === owner)
    slice.board[at(square[0], Number(square[1]))] = template ? { ...template } : { type, owner }
  }
}

describe('a rebounding piece attacks what it can reach (engine#170)', () => {
  it('will not let the King stay on a rank a Rook sweeps', () => {
    const g = game()
    only(g, [['d1', 'king', 0], ['a1', 'rook', 1], ['g7', 'king', 1]])
    const moves = g.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.filter(m => alg(m.to).endsWith('1'))).toEqual([])
  })

  it('never offers a move that captures a King', () => {
    const g = game()
    only(g, [['d2', 'king', 0], ['b2', 'rook', 1], ['g7', 'king', 1]])
    // Whoever is to move, taking a king must never be on offer.
    for (let ply = 0; ply < 6; ply += 1) {
      const moves = g.getLegalMoves()
      const board = g.getState().slice.board
      const regicide = moves.filter(m => board[m.to] && board[m.to].type === 'king')
      expect(regicide).toEqual([])
      if (!moves.length) break
      g.applyMove(moves[0])
    }
  })

  it('sees a Rook attacking around the corner it rebounds off', () => {
    // The Rook on g1 sweeps rank 1, turns at a1 and runs up the a-file, so a
    // King on a5 is in check from clear across the board.
    const g = game()
    only(g, [['a5', 'king', 0], ['g1', 'rook', 1], ['g7', 'king', 1]])
    const moves = g.getLegalMoves()
    expect(moves.filter(m => alg(m.to) === 'a4')).toEqual([])
    expect(moves.filter(m => alg(m.to) === 'a6')).toEqual([])
    expect(moves.some(m => alg(m.to) === 'b5')).toBe(true)
  })

  it('still lets the King stand where the Rook does not reach', () => {
    // b5, not d5: the middle of the board is the hole, and a King cannot be
    // there at all. The Rook on a1 sweeps the a-file and rank 1, neither of
    // which touches b5.
    const g = game()
    only(g, [['b5', 'king', 0], ['a1', 'rook', 1], ['g7', 'king', 1]])
    const targets = g.getLegalMoves().map(m => alg(m.to))
    expect(targets.length).toBeGreaterThan(0)
    expect(targets).toContain('b6')
    expect(targets).not.toContain('a5')
  })
})
