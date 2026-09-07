import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. "If a pawn moves to the last row, it is promoted to a Superpawn.
// A superpawn has the additional powers of moving and capturing one square
// straight sideways and going one or two square straight backwards or
// diagonally backward. When going backwards, it may neither capture nor jump.
// A superpawn's right to go backwards does not depend on its position."
// (chessvariants.com/ms.dir/congo.html)
//
// Congo declared no promotion at all: a pawn reaching the last rank stayed a
// pawn, in a game where the promoted piece is the strongest thing on the board.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)
const alg = (i) => 'abcdefg'[i % COLS] + (7 - Math.floor(i / COLS))

const game = () => createGameForFamily('chess', { variant: 'congo' })

function only(g, placements) {
  const slice = g.getState().slice
  const source = slice.board.slice()
  slice.board = slice.board.map(() => null)
  for (const [square, type, owner] of placements) {
    // A Superpawn is never in the starting position, so there is no template to
    // copy: build it. Copying an absent one silently placed an empty object,
    // which generated no moves and looked like a broken piece definition.
    const template = source.find(p => p && p.type === type && p.owner === owner)
    slice.board[at(square[0], Number(square[1]))] = template
      ? { ...template }
      : { type, owner }
  }
  return slice
}

const movesFrom = (g, square) => g.getLegalMoves()
  .filter(m => m.from === at(square[0], Number(square[1])))
  .map(m => alg(m.to)).sort()

describe("Congo's pawn promotes to a Superpawn (engine#171)", () => {
  it('offers promotion when a pawn reaches the last rank, and only to a Superpawn', () => {
    const g = game()
    only(g, [['d6', 'pawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const promos = g.getLegalMoves().filter(m => m.from === at('d', 6) && m.promotion)
    expect(promos.length).toBeGreaterThan(0)
    expect([...new Set(promos.map(m => m.promotion))]).toEqual(['superpawn'])
  })

  it('actually becomes a Superpawn on the board', () => {
    const g = game()
    only(g, [['d6', 'pawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const move = g.getLegalMoves().find(m => m.from === at('d', 6) && m.promotion)
    g.applyMove(move)
    const board = g.getState().slice.board
    expect(board.filter(p => p && p.type === 'superpawn').length).toBe(1)
  })

  it('moves sideways and backward, one or two squares, anywhere on the board', () => {
    const g = game()
    // Placed on the far side of the river to prove the backward right does not
    // depend on position, as the source says in as many words.
    only(g, [['d3', 'superpawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd3')
    expect(targets).toContain('c3')  // sideways
    expect(targets).toContain('e3')  // sideways
    expect(targets).toContain('d2')  // one straight back
    expect(targets).toContain('c2')  // one diagonally back
    expect(targets).toContain('b1')  // two diagonally back
    expect(targets).toContain('d4')  // and still forward
  })

  it('does not capture backward, and does not jump when going two', () => {
    const g = game()
    only(g, [['d3', 'superpawn', 0], ['d2', 'zebra', 1], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd3')
    expect(targets).not.toContain('d2')  // an enemy behind it cannot be taken
    expect(targets).not.toContain('d1')  // and cannot be jumped over
  })
})
