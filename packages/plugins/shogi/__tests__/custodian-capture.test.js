import { createShogiPlugin } from '../index.js'

// engine#160. `captureRule: custodian` was wired into applyMove and not into
// move generation, so Hasami Shogi captured both ways: the sandwich worked, and
// so did moving straight onto an enemy piece. Random play took 12 pieces by
// displacement against 3 by sandwich, which is ordinary shogi with an unusual
// piece set rather than the game the frontmatter describes.
//
// Custodial capture is not an addition to capture by displacement, it is
// instead of it, so the flag is derived from `captureRule` rather than declared
// a second time.

const COLS = 9
const at = (r, c) => r * COLS + c
const request = () => null
const context = (currentIndex = 0) => ({ __players: { currentIndex } })

// The variant as moddable-rules declares it, minus the setup: each test builds
// the position it is about.
const HASAMI = {
  rows: 9,
  cols: 9,
  royalType: 'none',
  captureRule: 'custodian',
  winCondition: 'reduced-to-one',
  drops: false,
  promotionZone: 0,
  pieceMoves: { soldier: { type: 'rider', dirs: 'orthogonal' } },
}

function boardWith(pieces) {
  const board = new Array(81).fill(null)
  for (const [index, owner] of pieces) board[index] = { type: 'soldier', owner }
  return board
}

function stateWith(pieces) {
  return { board: boardWith(pieces), hands: [[], []], _cols: COLS }
}

describe('custodian capture (engine#160)', () => {
  it('offers no move onto an occupied square', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    // One soldier of each side facing down the same file, nothing between.
    const state = stateWith([[at(4, 4), 0], [at(1, 4), 1]])
    const moves = plugin.getLegalMoves(state, context(0))

    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => state.board[m.to] === null)).toBe(true)
    expect(moves.some(m => m.to === at(1, 4))).toBe(false)
    // It still slides right up to the piece it may not take.
    expect(moves.some(m => m.to === at(2, 4))).toBe(true)
  })

  it('still offers the capture when the rule is not custodian', () => {
    const plugin = createShogiPlugin({ ...HASAMI, captureRule: undefined })
    plugin.init({}, { request })
    const state = stateWith([[at(4, 4), 0], [at(1, 4), 1]])
    const moves = plugin.getLegalMoves(state, context(0))
    expect(moves.some(m => m.to === at(1, 4))).toBe(true)
  })

  it('takes the piece the closing move sandwiches', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    // Enemy on (4,4) with a friend already anchored at (4,5); closing on (4,3)
    // sandwiches it.
    const state = stateWith([[at(4, 4), 1], [at(4, 5), 0], [at(8, 3), 0]])
    const next = plugin.applyMove({ from: at(8, 3), to: at(4, 3) }, state, context(0))

    expect(next.board[at(4, 4)]).toBe(null)
    expect(next.board[at(4, 3)]).toEqual({ type: 'soldier', owner: 0 })
    expect(next.board[at(4, 5)]).toEqual({ type: 'soldier', owner: 0 })
  })

  it('leaves a piece that moves into a gap between two enemies alone', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    // The mover walks between two enemies. Custody is evaluated for the mover,
    // so nothing happens to it.
    const state = stateWith([[at(4, 3), 1], [at(4, 5), 1], [at(8, 4), 0]])
    const next = plugin.applyMove({ from: at(8, 4), to: at(4, 4) }, state, context(0))

    expect(next.board[at(4, 4)]).toEqual({ type: 'soldier', owner: 0 })
    expect(next.board[at(4, 3)]).toEqual({ type: 'soldier', owner: 1 })
    expect(next.board[at(4, 5)]).toEqual({ type: 'soldier', owner: 1 })
  })

  it('takes a corner piece held by both of its neighbours', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    const state = stateWith([[at(0, 0), 1], [at(0, 1), 0], [at(8, 0), 0]])
    const next = plugin.applyMove({ from: at(8, 0), to: at(1, 0) }, state, context(0))
    expect(next.board[at(0, 0)]).toBe(null)
  })

  it('sandwiches more than one piece with a single move', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    // Closing on (4,4) traps the enemy above it and the enemy to its left.
    const state = stateWith([
      [at(3, 4), 1], [at(2, 4), 0],
      [at(4, 3), 1], [at(4, 2), 0],
      [at(8, 4), 0],
    ])
    const next = plugin.applyMove({ from: at(8, 4), to: at(4, 4) }, state, context(0))
    expect(next.board[at(3, 4)]).toBe(null)
    expect(next.board[at(4, 3)]).toBe(null)
  })

  it('ends when a side is reduced to one piece', () => {
    const plugin = createShogiPlugin(HASAMI)
    plugin.init({}, { request })
    const state = stateWith([[at(0, 0), 1], [at(4, 4), 0], [at(4, 5), 0]])
    expect(plugin.checkWin(state, context(0))).toBe(0)
  })
})
