import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#171. Congo's Lion moves as a king and may never leave its own 3x3
// castle - c1-e3 for White, c5-e7 for Black. It had a plain king step and the
// run of the whole board, which is not a detail: the Lion is the piece you win
// by capturing, and a royal that can walk away from its castle is a different
// game.
//
// The castles are at opposite ends, so the confinement is declared per seat.

const COLS = 7
const at = (file, rank) => (7 - rank) * COLS + 'abcdefg'.indexOf(file)
const alg = (i) => 'abcdefg'[i % COLS] + (7 - Math.floor(i / COLS))

const game = () => createGameForFamily('chess', { variant: 'congo' })
const sliceOf = (g) => { const s = g.getState(); return s?.slice || s }

const WHITE_CASTLE = ['c1','d1','e1','c2','d2','e2','c3','d3','e3']
const BLACK_CASTLE = ['c5','d5','e5','c6','d6','e6','c7','d7','e7']

describe("Congo's Lion is confined to its castle (engine#171)", () => {
  it('starts on d1 with White and d7 with Black', () => {
    const board = sliceOf(game()).board
    expect(board[at('d', 1)].type).toBe('lion')
    expect(board[at('d', 7)].type).toBe('lion')
  })

  it('has no Lion move at all in the opening position, hemmed in by its own men', () => {
    const g = game()
    const board = sliceOf(g).board
    const lionMoves = g.getLegalMoves().filter(m => board[m.from]?.type === 'lion')
    expect(lionMoves).toEqual([])
  })

  it('offers the White Lion no move outside c1-e3 once it can move at all', () => {
    // Empty the whole board but for the Lion, so nothing except the castle is
    // stopping it. Unconfined, a king on d1 reaches c1..e2 - eight squares,
    // three of which are outside the castle only once it walks further; put it
    // on the castle edge to make the boundary the only thing being tested.
    const g = game()
    const slice = sliceOf(g)
    const lion = slice.board[at('d', 1)]
    slice.board = slice.board.map(() => null)
    slice.board[at('d', 3)] = lion
    const lionMoves = g.getLegalMoves().filter(m => slice.board[m.from]?.type === 'lion')
    const targets = lionMoves.map(m => alg(m.to)).sort()
    expect(targets.length).toBeGreaterThan(0)
    // d4 is the rank above the castle and a legal king step; it must not appear.
    expect(targets).not.toContain('d4')
    expect(targets).not.toContain('c4')
    expect(targets).not.toContain('e4')
    expect(targets.filter(sq => !WHITE_CASTLE.includes(sq))).toEqual([])
  })

  it('lets the Lion move freely inside the castle', () => {
    const g = game()
    const slice = sliceOf(g)
    for (const sq of ['c2', 'd2', 'e2']) slice.board[at(sq[0], Number(sq[1]))] = null
    const lionMoves = g.getLegalMoves().filter(m => slice.board[m.from]?.type === 'lion')
    const targets = lionMoves.map(m => alg(m.to)).sort()
    expect(targets).toContain('d2')
    expect(targets.every(sq => WHITE_CASTLE.includes(sq))).toBe(true)
  })

  it('confines the Black Lion to the other end of the board', () => {
    // The mirror of the White case, and asserted rather than skipped: an early
    // return when no move is found would pass whether or not the confinement
    // exists, which is no test at all.
    const g = game()
    // Hand the turn over by playing a White move, rather than by writing to a
    // copy of the state and hoping the plugin reads it back.
    g.applyMove(g.getLegalMoves()[0])
    const slice = g.getState().slice
    const lion = slice.board.find(p => p && p.type === 'lion' && p.owner !== slice.board[at('d', 1)]?.owner)
      || slice.board[at('d', 7)]
    slice.board = slice.board.map(() => null)
    slice.board[at('d', 5)] = lion
    const lionMoves = g.getLegalMoves().filter(m => slice.board[m.from]?.type === 'lion')
    const targets = lionMoves.map(m => alg(m.to)).sort()
    expect(targets.length).toBeGreaterThan(0)
    // d4 is the rank below the castle and a legal king step from d5.
    expect(targets).not.toContain('d4')
    expect(targets).not.toContain('c4')
    expect(targets).not.toContain('e4')
    expect(targets.filter(sq => !BLACK_CASTLE.includes(sq))).toEqual([])
  })
})
