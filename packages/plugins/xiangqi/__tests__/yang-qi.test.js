import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#162. Yang Qi is filed under Xiangqi by descent and plays as a chess
// game: Fergus Duniho replaced most Xiangqi pieces with Western ones, removed
// the river and the fortress, and extended the Cannon's screen capture to the
// diagonals as the Vao.
//
// It needed no new family and no escape hatch to the chess plugin. What it
// needed was for a DECLARED piece to face the right way for its owner - the
// soldier generator had always been directional and pieces described in
// frontmatter had not, so a variant could describe a piece that advances and
// watch both armies advance up the board together.

const COLS = 9
const at = (file, rank) => (10 - rank) * COLS + 'abcdefghi'.indexOf(file)
const alg = (i) => 'abcdefghi'[i % COLS] + (10 - Math.floor(i / COLS))

const game = () => createGameForFamily('xiangqi', { variant: 'yang-qi' })
const movesFor = (g, type) => {
  const board = g.getState().slice.board
  return g.getLegalMoves().filter(m => board[m.from]?.type === type)
}

describe('Yang Qi plays as the chess game it is (engine#162)', () => {
  it('opens with every piece type able to move', () => {
    const g = game()
    const board = g.getState().slice.board
    const byType = {}
    for (const m of g.getLegalMoves()) {
      const t = board[m.from]?.type
      byType[t] = (byType[t] || 0) + 1
    }
    expect(Object.keys(byType).sort()).toEqual(
      ['cannon', 'chariot', 'elephant', 'general', 'horse', 'soldier', 'vao'])
  })

  it('sends each side\'s pawns the other way', () => {
    const g = game()
    const white = movesFor(g, 'soldier').map(m => alg(m.from) + '-' + alg(m.to))
    expect(white).toContain('a3-a4')
    g.applyMove(movesFor(g, 'soldier')[0])
    const black = movesFor(g, 'soldier').map(m => alg(m.from) + '-' + alg(m.to))
    expect(black).toContain('a8-a7')
    expect(black.some(m => m.startsWith('a8-a9'))).toBe(false)
  })

  it('lets a pawn on its starting rank advance two, and one off it advance one', () => {
    const g = game()
    const pawns = movesFor(g, 'soldier').map(m => alg(m.from) + '-' + alg(m.to))
    // a3 is a starting-rank pawn; b4 is not.
    expect(pawns).toContain('a3-a5')
    expect(pawns).toContain('a3-a4')
    expect(pawns).toContain('b4-b5')
    expect(pawns.some(m => m === 'b4-b6')).toBe(false)
  })

  it('gives the Knight a leap no neighbour can block', () => {
    // The Xiangqi horse is lamed by the piece beside it; this one is not, and
    // at the opening it is hemmed in by its own pawns on both landing squares.
    const g = game()
    const slice = g.getState().slice
    slice.board[at('d', 2)] = null
    const knight = movesFor(g, 'horse').filter(m => m.from === at('b', 1)).map(m => alg(m.to))
    expect(knight).toContain('d2')
  })

  it('gives the Vao the Cannon\'s capture on the diagonals', () => {
    const g = game()
    const slice = g.getState().slice
    // Vao on d1, a screen on e2, an enemy beyond it on f3.
    slice.board[at('e', 2)] = { type: 'soldier', owner: 0 }
    slice.board[at('f', 3)] = { type: 'chariot', owner: 1 }
    const vao = movesFor(g, 'vao').filter(m => m.from === at('d', 1)).map(m => alg(m.to))
    expect(vao).toContain('f3')
  })

  it('confines nothing: there is no palace and no river here', () => {
    const g = game()
    const slice = g.getState().slice
    slice.board = slice.board.map(() => null)
    slice.board[at('e', 5)] = { type: 'general', owner: 0 }
    slice.board[at('a', 1)] = { type: 'general', owner: 1 }
    const king = movesFor(g, 'general').map(m => alg(m.to)).sort()
    expect(king).toEqual(['d4', 'd5', 'd6', 'e4', 'e6', 'f4', 'f5', 'f6'])
  })
})
