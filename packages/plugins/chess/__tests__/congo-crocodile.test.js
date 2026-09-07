import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. Congo's Crocodile moves as a king everywhere, and additionally
// slides as a rook along its file TOWARD the river when it is on either bank,
// and along the river rank once it is in the water.
//
// That is not a property of the piece or of the seat: it is a property of the
// square it is standing on, which is the thing no primitive could express. It
// had a plain king step.

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

describe("Congo's Crocodile moves by where it stands (engine#171)", () => {
  it('slides up its file toward the river from the south bank, and stops in it', () => {
    const g = game()
    only(g, [['d1', 'crocodile', 0], ['c1', 'lion', 0], ['c7', 'lion', 1]])
    const targets = movesFrom(g, 'd1')
    // Toward the river: d2, d3, d4 (the river rank itself), and no further.
    expect(targets).toContain('d2')
    expect(targets).toContain('d3')
    expect(targets).toContain('d4')
    expect(targets).not.toContain('d5')
    expect(targets).not.toContain('d6')
  })

  it('does not slide away from the river', () => {
    const g = game()
    only(g, [['d3', 'crocodile', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    const targets = movesFrom(g, 'd3')
    // Toward the water is one square: d4, the river itself. Away from it the
    // Crocodile has only its king step, so d2 is reachable and d1 - two squares
    // down an empty file - is not.
    expect(targets).toContain('d4')
    expect(targets).toContain('d2')
    expect(targets).not.toContain('d1')
    expect(targets).not.toContain('d5')
  })

  it('slides along the river rank once in the water', () => {
    const g = game()
    only(g, [['d4', 'crocodile', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    const targets = movesFrom(g, 'd4')
    expect(targets).toContain('a4')
    expect(targets).toContain('g4')
    // And still the king step off the rank.
    expect(targets).toContain('d5')
    expect(targets).toContain('d3')
    // But no rook slide up or down the file from inside the water.
    expect(targets).not.toContain('d6')
    expect(targets).not.toContain('d2')
  })

  it('keeps its king step in every region', () => {
    const g = game()
    only(g, [['d6', 'crocodile', 0], ['c7', 'lion', 1], ['d1', 'lion', 0]])
    const targets = movesFrom(g, 'd6')
    for (const sq of ['c5', 'd5', 'e5', 'c6', 'e6', 'c7', 'e7']) {
      if (sq === 'c7') continue // occupied by the Black Lion, a capture not a step
      expect(targets).toContain(sq)
    }
  })
})
