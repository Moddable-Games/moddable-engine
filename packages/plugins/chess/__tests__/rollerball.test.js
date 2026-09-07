import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#170. Rollerball's board is a racetrack - a 7x7 with the middle 3x3
// removed - and "the play is mostly clockwise". Its pieces are defined relative
// to that direction of travel, which rotates as a piece goes round, so forward
// is a property of the square a piece stands on and not of the seat that owns
// it. Both players move the same way round.
//
// It played as ordinary chess. Measured from the opening position White had
// five legal moves, NONE of them a pawn move: c2's forward square c3 is one of
// the nine voids and c1's is its own pawn. It was also being offered castling,
// which Rollerball does not have.
//
// The four zones are verified against all five pawn diagrams published with the
// rules at chessvariants.com/40.dir/rollerball/.

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
    slice.board[at(square[0], Number(square[1]))] = { ...template }
  }
  return slice
}

const movesFrom = (g, square) => g.getLegalMoves()
  .filter(m => m.from === at(square[0], Number(square[1])))
  .map(m => alg(m.to)).sort()

describe('Rollerball: forward is clockwise (engine#170)', () => {
  it('offers pawn moves in the opening position, which it never did', () => {
    const g = game()
    const board = g.getState().slice.board
    const pawnMoves = g.getLegalMoves().filter(m => board[m.from]?.type === 'pawn')
    expect(pawnMoves.length).toBeGreaterThan(0)
  })

  it('offers no castling, which Rollerball does not have', () => {
    const g = game()
    expect(g.getLegalMoves().filter(m => m.castle)).toEqual([])
  })

  // Each of the five diagrams published with the rules, read off the board.
  const DIAGRAMS = [
    ['c1', ['b1', 'b2']],
    ['c2', ['b1', 'b2', 'b3']],
    ['b1', ['a1', 'a2']],
    ['a1', ['a2', 'b2']],
    ['b2', ['a3', 'b3']],
  ]
  for (const [from, expected] of DIAGRAMS) {
    it(`matches the published diagram for a pawn on ${from}`, () => {
      const g = game()
      only(g, [[from, 'pawn', 0], ['d2', 'king', 0], ['d6', 'king', 1]])
      expect(movesFrom(g, from)).toEqual(expected.slice().sort())
    })
  }

  it('turns the corner: a pawn in the south zone goes west, in the west zone north', () => {
    const g = game()
    only(g, [['d1', 'pawn', 0], ['d2', 'king', 0], ['d6', 'king', 1]])
    // d1 is south: forward is west.
    expect(movesFrom(g, 'd1')).toContain('c1')
    expect(movesFrom(g, 'd1')).not.toContain('e1')
  })

  it('matches the published Rook diagram for f2, which needs no rebound', () => {
    // From the rules page: the whole of rank 2, plus f3 and f1. f2 is in the
    // east zone, so forward is south (f1), sideways runs along the rank in both
    // directions (a2-e2 and g2), and backward is one square north (f3).
    const g = game()
    // Kings kept off rank 2 and the f-file so nothing blocks the Rook's own lines.
    only(g, [['f2', 'rook', 0], ['a7', 'king', 0], ['g7', 'king', 1]])
    expect(movesFrom(g, 'f2')).toEqual(
      ['a2', 'b2', 'c2', 'd2', 'e2', 'f1', 'f3', 'g2'].sort()
    )
  })

  it('never slides the Rook backward, only one square', () => {
    const g = game()
    only(g, [['f2', 'rook', 0], ['a7', 'king', 0], ['g7', 'king', 1]])
    const targets = movesFrom(g, 'f2')
    expect(targets).toContain('f3')   // one square backward
    expect(targets).not.toContain('f4')  // but no slide
    expect(targets).not.toContain('f5')
  })

  it('sends both players the same way round the ring', () => {
    const g = game()
    only(g, [['d2', 'king', 0], ['d6', 'king', 1], ['e7', 'pawn', 1], ['a1', 'pawn', 0]])
    // Black's pawn on e7 is in the north zone, where forward is east.
    g.applyMove(g.getLegalMoves().find(m => m.from === at('a', 1)))
    const blackPawnMoves = g.getLegalMoves()
      .filter(m => m.from === at('e', 7)).map(m => alg(m.to)).sort()
    expect(blackPawnMoves).toContain('f7')
    expect(blackPawnMoves).not.toContain('d7')
  })
})
