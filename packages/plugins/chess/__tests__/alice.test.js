import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

// engine#159. Alice Chess is two boards: "after moving, the piece is
// transferred to the corresponding square on the other board. A move is only
// legal if that square is vacant."
//
// The issue asked one question before anything could be built - N boards, or
// one board with a layer coordinate? One cell space, because topology.grid
// already takes an explicit cell list and this variant's own frontmatter says
// `physical_representation: one-board`.
//
// The geometry does none of the crossing. Every ray stays inside its own plane,
// so a piece can only move on the board it stands on; the transfer is a rule.

const PLANE = 64
const twin = (i) => (i + PLANE) % 128

describe('the geometry keeps each board separate', () => {
  const topo = createGridTopology({ rows: 8, cols: 8, layers: 2 })

  test('two planes make one cell space', () => {
    expect(topo.getAllCells()).toHaveLength(128)
    expect(topo.getCellCount()).toBe(128)
  })

  test('a slider never leaves the board it is on', () => {
    const fromB = PLANE + 8 * 4 + 4
    const reach = topo.rays(fromB, 'all').flat()
    expect(reach.length).toBeGreaterThan(0)
    expect(reach.every(i => i >= PLANE)).toBe(true)
  })

  test('a leaper never leaves it either', () => {
    const fromA = 8 * 4 + 4
    const jumps = topo.leapTargets(fromA, [[1, 2], [2, 1], [-2, -1]])
    expect(jumps.length).toBe(3)
    expect(jumps.every(i => i < PLANE)).toBe(true)
  })
})

describe('alice chess', () => {
  let game
  beforeAll(async () => { game = await createGameForFamily('chess', { variant: 'alice' }) })
  const board = () => game.getState().slice.board

  test('starts with everything on the first board', () => {
    expect(board()).toHaveLength(128)
    expect(board().slice(0, PLANE).filter(Boolean)).toHaveLength(32)
    expect(board().slice(PLANE).filter(Boolean)).toHaveLength(0)
  })

  test('opens with the twenty moves of ordinary chess', () => {
    // Both boards are one cell space, but only one of them has pieces on it,
    // and a piece moves as it always did.
    expect(game.getLegalMoves()).toHaveLength(20)
  })

  test('a move lands the piece on the other board', () => {
    const move = game.getLegalMoves()[0]
    const after = game.applyMove(move) && board()
    expect(after[move.to]).toBeNull()
    expect(after[twin(move.to)]).toBeTruthy()
    expect(after.slice(PLANE).filter(Boolean)).toHaveLength(1)
    expect(after.filter(Boolean)).toHaveLength(32)   // nothing lost in transit
  })

  test('it keeps playing, with pieces on both boards', () => {
    let plies = 1
    for (; plies < 40; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[plies % moves.length])
    }
    expect(plies).toBe(40)
    expect(board().slice(PLANE).filter(Boolean).length).toBeGreaterThan(0)
    expect(board().slice(0, PLANE).filter(Boolean).length).toBeGreaterThan(0)
  })
})

describe('a move is refused when the far square is taken', () => {
  test('every offered move has a vacant counterpart', async () => {
    const game = await createGameForFamily('chess', { variant: 'alice' })
    for (let ply = 0; ply < 30; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const b = game.getState().slice.board
      // This is the rule, stated directly: nothing on offer may land on a
      // square whose twin is occupied.
      for (const m of moves) {
        if (m.to === undefined) continue
        expect(b[twin(m.to)]).toBeNull()
      }
      game.applyMove(moves[ply % moves.length])
    }
  })
})
