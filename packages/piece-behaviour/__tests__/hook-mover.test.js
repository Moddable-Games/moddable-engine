import { bent } from '../index.js'
import { createGridTopology } from '../../topologies/grid/index.js'

// engine#174. A hook mover "runs orthogonally then turns ninety degrees and
// continues" - Maka-Dai-Dai, Tai and Taikyoku all have them. `bent` existed but
// fixed its corner at an exact distance from the start, which is right for the
// xiangqi elephant and cannot express a hook: the corner may be any square
// along the first run.
//
// The other half was that an orthogonal first leg never turned at all.
// `continuations` decomposed a direction into its components, which is correct
// for a diagonal first leg and a no-op for an orthogonal one - [0,1] decomposes
// to [0,1] - so a hook mover reached exactly the squares of a rook.

const N = 9
const topo = createGridTopology({ rows: N, cols: N })
const at = (r, c) => r * N + c
const CENTRE = at(4, 4)
const hook = () => bent({ first: 'orthogonal', firstSteps: 'any', minSecondLeg: 0 })
const empty = () => new Array(N * N).fill(null)
const reach = (board) => new Set(hook().genMoves(topo, CENTRE, board).map(m => m.to))

test('reaches every square on an empty board', () => {
  // One run and one turn gets anywhere: out along a rank, then along a file.
  expect(reach(empty()).size).toBe(N * N - 1)
})

test('reaches more than a rook, which is the whole point', () => {
  const rookSquares = new Set()
  for (let i = 0; i < N; i++) { rookSquares.add(at(4, i)); rookSquares.add(at(i, 4)) }
  rookSquares.delete(CENTRE)
  expect(reach(empty()).size).toBeGreaterThan(rookSquares.size)
  expect(reach(empty()).has(at(0, 0))).toBe(true)     // a corner, off both lines
})

test('a piece in the way ends that run', () => {
  const board = empty()
  board[at(4, 6)] = { enemy: true }
  const dest = reach(board)
  expect(dest.has(at(4, 6))).toBe(true)               // may take it
  expect(dest.has(at(4, 7))).toBe(false)              // not past it
  expect(dest.has(at(4, 8))).toBe(false)
  expect(dest.has(at(0, 5))).toBe(true)               // a turn before it still works
  // (0,7) stays reachable: up the file first, then along the rank, which never
  // touches the blocked square. Only the squares beyond it on its own line are
  // lost, because reaching those with one turn needs that line.
  expect(dest.has(at(0, 7))).toBe(true)
})

test('a friendly piece blocks without offering itself', () => {
  const board = empty()
  board[at(4, 6)] = { friendly: true }
  const dest = reach(board)
  expect(dest.has(at(4, 6))).toBe(false)
  expect(dest.has(at(4, 7))).toBe(false)
  expect(dest.has(at(0, 5))).toBe(true)
})

test('a fixed corner still means a fixed corner', () => {
  // Only `any` turns the corner anywhere. A one-step first leg still starts
  // from an adjacent square and cannot reach what a hook reaches.
  const fixed = bent({ first: 'orthogonal', firstSteps: 1, minSecondLeg: 0 })
  const dest = new Set(fixed.genMoves(topo, CENTRE, empty()).map(m => m.to))
  expect(dest.size).toBeLessThan(reach(empty()).size)
  expect(dest.has(at(0, 0))).toBe(false)              // no route with one corner
  expect(reach(empty()).has(at(0, 0))).toBe(true)
})
