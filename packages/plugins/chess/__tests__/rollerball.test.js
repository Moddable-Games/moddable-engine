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

  it('matches the published Rook diagram for g1, which needs the rebound', () => {
    // From the rules page: the whole a-file, b1 to f1, and g2. The Rook sweeps
    // rank 1 westward, reaches the corner at a1, turns, and carries on up the
    // entire a-file. g2 is its one square backward.
    const g = game()
    only(g, [['g1', 'rook', 0], ['d6', 'king', 0], ['f7', 'king', 1]])
    expect(movesFrom(g, 'g1')).toEqual(
      ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'g2'].sort()
    )
  })

  it('stops at an edge that is not a corner', () => {
    // The same Rook sliding up the f-file reaches f7 on the top edge and stops:
    // a rebound is allowed only on the four corners.
    const g = game()
    only(g, [['f2', 'rook', 0], ['a7', 'king', 0], ['g7', 'king', 1]])
    const targets = movesFrom(g, 'f2')
    expect(targets).not.toContain('e7')
    expect(targets).not.toContain('g7')
  })

  it('matches the published Bishop diagram for f1', () => {
    // From the rules page: e2, g2 and d1. The forward diagonal runs up-left to
    // e2, meets the internal wall of the hole and reflects downward to d1. g2 is
    // one square diagonally backward.
    const g = game()
    only(g, [['f1', 'bishop', 0], ['d6', 'king', 0], ['b6', 'king', 1]])
    expect(movesFrom(g, 'f1')).toEqual(['d1', 'e2', 'g2'].sort())
  })

  it('matches the published Bishop diagram for e2', () => {
    // From the rules page: a4, b3, c2, d1, f1 and f3. The down-left diagonal
    // reaches d1 on the bottom edge, reflects up-left and runs c2, b3, a4.
    const g = game()
    only(g, [['e2', 'bishop', 0], ['d6', 'king', 0], ['b6', 'king', 1]])
    expect(movesFrom(g, 'e2')).toEqual(['a4', 'b3', 'c2', 'd1', 'f1', 'f3'].sort())
  })

  it('promotes a pawn that reaches the opposing pawns\' starting squares', () => {
    // "When reaching the starting square of opposite Pawns it promotes to
    // either a Rook or a Bishop." White's pawns start on c1 and c2, Black's on
    // e6 and e7, so White promotes on e6 and e7.
    const g = game()
    // d6 is in the north zone, where forward is east - so it steps onto e6.
    only(g, [['d6', 'pawn', 0], ['a4', 'king', 0], ['a1', 'king', 1]])
    const promos = g.getLegalMoves().filter(m => m.from === at('d', 6) && m.promotion)
    expect(promos.length).toBeGreaterThan(0)
    expect([...new Set(promos.map(m => m.promotion))].sort()).toEqual(['bishop', 'rook'])
    // The pawn's three forward offsets from d6 point at e5, e6 and e7. e5 is
    // inside the hole, and e6 and e7 are both starting squares of Black's pawns,
    // so every move it has is a promotion.
    expect([...new Set(promos.map(m => alg(m.to)))].sort()).toEqual(['e6', 'e7'])
  })

  it('does not promote elsewhere on the board', () => {
    const g = game()
    only(g, [['c1', 'pawn', 0], ['a4', 'king', 0], ['a1', 'king', 1]])
    expect(g.getLegalMoves().filter(m => m.from === at('c', 1) && m.promotion)).toEqual([])
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
