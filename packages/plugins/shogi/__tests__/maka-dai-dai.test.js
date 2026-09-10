import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { areaMove, universalLeaper } from '../../../piece-behaviour/index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

// engine#160. Maka-Dai-Dai Shogi: 19x19, 96 pieces a side, 50 types on the
// board and 26 more reachable by promotion.
//
// Its movement came from Wikipedia's bullets, cross-checked against the
// variant file's own 107-row table. That comparison is what found the Angry
// Boar moving two ways where the source gives four. Twenty-two pieces are
// disputed between the Edo-era manuscripts and every reading is recorded in
// the variant's `disputed:` block.

let game
beforeAll(async () => { game = await createGameForFamily('shogi', { variant: 'maka-dai-dai-shogi' }) })

const board = () => game.getState().slice.board

test('19x19 with 96 pieces a side', () => {
  expect(board()).toHaveLength(361)
  expect(board().filter(c => c && c.owner === 0)).toHaveLength(96)
  expect(board().filter(c => c && c.owner === 1)).toHaveLength(96)
})

test('every piece on the board has a movement definition', () => {
  // The plugin throws on an unmapped type, so reaching here is the assertion;
  // this states what it covers.
  const types = new Set(board().filter(Boolean).map(c => c.type))
  expect(types.size).toBe(50)
})

test('it plays', () => {
  let plies = 0
  for (; plies < 60; plies++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    game.applyMove(moves[plies % moves.length])
  }
  expect(plies).toBe(60)
})

// The two pieces this variant needed that nothing else in the corpus has.
describe('the pieces that needed new primitives', () => {
  const N = 19
  const topo = createGridTopology({ rows: N, cols: N })
  const at = (r, c) => r * N + c
  const K = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]

  test('the lion dog runs three squares along one line and eats what it passes', () => {
    // "can make a three-step lion move along any ONE of the eight orthogonal or
    // diagonal directions ... unlike the lion itself ... restricted to moving
    // along a straight line".
    const b = new Array(N * N).fill(null)
    b[at(9, 10)] = { enemy: true }
    b[at(9, 11)] = { enemy: true }
    const moves = areaMove(K, { steps: 3, sameLine: true }).genMoves(topo, at(9, 9), b)

    const both = moves.find(m => m.to === at(9, 12) && Array.isArray(m.via) && m.via.length === 2)
    expect(both).toBeDefined()

    // "capture a piece on the first and second square, and then retreat to the
    // first square", and plain igui off the first.
    expect(moves.some(m => m.to === at(9, 9) && Array.isArray(m.via) && m.via.length === 2)).toBe(true)
    expect(moves.some(m => m.to === at(9, 9) && Array.isArray(m.via) && m.via.length === 1)).toBe(true)
  })

  test('it may not turn, which is what separates it from a lion', () => {
    const b = new Array(N * N).fill(null)
    const reached = new Set(areaMove(K, { steps: 3, sameLine: true }).genMoves(topo, at(9, 9), b).map(m => m.to))
    expect(reached.has(at(9, 12))).toBe(true)      // three along one line
    expect(reached.has(at(8, 11))).toBe(false)     // a turn a lion could make
  })

  test('the emperor jumps to any empty square and captures nothing', () => {
    // "The emperor can jump to any empty square on the board."
    const b = new Array(N * N).fill(null)
    b[at(0, 0)] = { enemy: true }
    const moves = universalLeaper({ quiet: true }).genMoves(topo, at(9, 9), b)
    expect(moves).toHaveLength(N * N - 2)          // every square but its own and the occupied one
    expect(moves.some(m => m.to === at(0, 0))).toBe(false)
  })
})
