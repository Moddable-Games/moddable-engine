import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. Congo's rank 4 is a river. A piece that moves into it survives
// one turn there; if its owner does not move it out again on their very next
// turn, it drowns and is removed. The Crocodile never drowns.
//
// The board had no river at all: a Zebra could stand on rank 4 for the whole
// game. The rule is declared in frontmatter - which rows, which piece types are
// immune - so nothing here knows what a river or a crocodile is.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)
const alg = (i) => 'abcdefg'[i % COLS] + (7 - Math.floor(i / COLS))

const game = () => createGameForFamily('chess', { variant: 'congo' })

// Put one piece of each side on the board and nothing else, so the only thing
// that can remove a piece is the river.
function bare(g, placements) {
  const state = g.getState()
  const slice = state.slice
  const source = slice.board.slice()
  slice.board = slice.board.map(() => null)
  for (const [square, type, owner] of placements) {
    const template = source.find(p => p && p.type === type && p.owner === owner)
    slice.board[at(square[0], Number(square[1]))] = { ...template }
  }
  return slice
}

const occupied = (slice) => slice.board
  .map((p, i) => (p ? `${p.type}@${alg(i)}` : null)).filter(Boolean).sort()

describe("Congo's river drowns what stands in it (engine#171)", () => {
  it('leaves a piece alone on the turn it enters the river', () => {
    const g = game()
    const slice = bare(g, [['d3', 'elephant', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    const step = g.getLegalMoves().find(m => m.from === at('d', 3) && m.to === at('d', 4))
    expect(step).toBeDefined()
    g.applyMove(step)
    expect(occupied(g.getState().slice)).toContain('elephant@d4')
  })

  it('drowns it if its owner does not move it out on their next turn', () => {
    const g = game()
    bare(g, [['d3', 'elephant', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    g.applyMove(g.getLegalMoves().find(m => m.from === at('d', 3) && m.to === at('d', 4)))
    // Black plays something irrelevant. Asserted, so a position where Black has
    // no move cannot make this test pass by accident.
    const blackMove = g.getLegalMoves()[0]
    expect(blackMove).toBeDefined()
    g.applyMove(blackMove)
    // White moves a different piece, leaving the Zebra in the water.
    const elsewhere = g.getLegalMoves().find(m => m.from !== at('d', 4))
    expect(elsewhere).toBeDefined()
    g.applyMove(elsewhere)
    const left = occupied(g.getState().slice)
    expect(left.some(s => s.startsWith('elephant'))).toBe(false)
  })

  it('spares it if its owner does move it out in time', () => {
    const g = game()
    bare(g, [['d3', 'elephant', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    g.applyMove(g.getLegalMoves().find(m => m.from === at('d', 3) && m.to === at('d', 4)))
    const black1 = g.getLegalMoves()[0]
    expect(black1).toBeDefined()
    g.applyMove(black1)
    const out = g.getLegalMoves().find(m => m.from === at('d', 4) && m.to === at('d', 5))
    expect(out).toBeDefined()
    g.applyMove(out)
    expect(occupied(g.getState().slice)).toContain('elephant@d5')
  })

  it('never drowns the Crocodile, which is declared immune', () => {
    const g = game()
    bare(g, [['d3', 'crocodile', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    g.applyMove(g.getLegalMoves().find(m => m.from === at('d', 3) && m.to === at('d', 4)))
    const black2 = g.getLegalMoves()[0]
    expect(black2).toBeDefined()
    g.applyMove(black2)
    const elsewhere = g.getLegalMoves().find(m => m.from !== at('d', 4))
    expect(elsewhere).toBeDefined()
    g.applyMove(elsewhere)
    expect(occupied(g.getState().slice)).toContain('crocodile@d4')
  })
})
