import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. "Pawns move and capture both straight and diagonally forward."
// (chessvariants.com/ms.dir/congo.html, rules by Christian Freeling.)
//
// That is not a chess pawn, which moves straight and captures diagonally.
// Congo's does both, in all three forward directions, and has no two-square
// first move - the source gives it none, and one would land it in the river.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)
const alg = (i) => 'abcdefg'[i % COLS] + (7 - Math.floor(i / COLS))

const game = () => createGameForFamily('chess', { variant: 'congo' })

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

describe("Congo's pawn moves and captures in three directions (engine#171)", () => {
  it('steps diagonally forward onto an empty square', () => {
    const g = game()
    only(g, [['d2', 'pawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd2')
    expect(targets).toContain('d3')
    expect(targets).toContain('c3')
    expect(targets).toContain('e3')
  })

  it('captures straight forward, which a chess pawn cannot', () => {
    const g = game()
    only(g, [['d2', 'pawn', 0], ['d3', 'zebra', 1], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd2')
    expect(targets).toContain('d3')
    const capture = g.getLegalMoves().find(m => m.from === at('d', 2) && m.to === at('d', 3))
    g.applyMove(capture)
    const board = g.getState().slice.board
    expect(board[at('d', 3)].type).toBe('pawn')
    expect(board.filter(p => p && p.type === 'zebra')).toEqual([])
  })

  it('has no two-square first move, which would land it in the river', () => {
    const g = game()
    only(g, [['d2', 'pawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    expect(movesFrom(g, 'd2')).not.toContain('d4')
  })

  it('does not move or capture backward or sideways', () => {
    const g = game()
    only(g, [['d3', 'pawn', 0], ['d1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd3')
    for (const sq of ['d2', 'c3', 'e3', 'c2', 'e2']) {
      expect(targets).not.toContain(sq)
    }
  })
})
