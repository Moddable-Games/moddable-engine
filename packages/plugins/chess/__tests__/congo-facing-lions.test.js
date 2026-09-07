import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. "In addition, lions can capture other lions if they `see' it,
// i.e., if there is a vertical or diagonal line with no pieces between the two
// lions, the lion may jump to the other lion and capture it."
// (chessvariants.com/ms.dir/congo.html)
//
// Note vertical or diagonal - not along a rank. And note that this is the one
// move that takes a Lion out of its own castle, so it must not be confined.

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
    slice.board[at(square[0], Number(square[1]))] = template ? { ...template } : { type, owner }
  }
  return slice
}

const movesFrom = (g, square) => g.getLegalMoves()
  .filter(m => m.from === at(square[0], Number(square[1])))
  .map(m => alg(m.to)).sort()

describe("Congo's Lions capture each other down an open line (engine#171)", () => {
  it('takes the other Lion down an open file, leaving its own castle to do it', () => {
    const g = game()
    only(g, [['d1', 'lion', 0], ['d7', 'lion', 1]])
    expect(movesFrom(g, 'd1')).toContain('d7')
  })

  it('takes it down an open diagonal', () => {
    const g = game()
    only(g, [['c1', 'lion', 0], ['e3', 'lion', 1]])
    expect(movesFrom(g, 'c1')).toContain('e3')
  })

  it('does not take along a rank, which the rule does not allow', () => {
    const g = game()
    only(g, [['c1', 'lion', 0], ['f1', 'lion', 1]])
    expect(movesFrom(g, 'c1')).not.toContain('f1')
  })

  it('is blocked by anything standing between', () => {
    const g = game()
    only(g, [['d1', 'lion', 0], ['d7', 'lion', 1], ['d4', 'zebra', 1]])
    expect(movesFrom(g, 'd1')).not.toContain('d7')
  })

  it('takes only a Lion, not whatever it happens to see', () => {
    const g = game()
    only(g, [['d1', 'lion', 0], ['d5', 'zebra', 1], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd1')
    expect(targets).not.toContain('d5')
    // and it still cannot simply walk up the file
    expect(targets).not.toContain('d4')
    expect(targets).not.toContain('d3')
  })

  it('still cannot walk out of its castle', () => {
    const g = game()
    only(g, [['d3', 'lion', 0], ['c7', 'lion', 1]])
    expect(movesFrom(g, 'd3')).not.toContain('d4')
  })
})
