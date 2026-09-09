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

// The Capricorn is the hook mover's diagonal twin: "It can move any number of
// free squares in one of the four diagonal directions, then any number of free
// squares in a perpendicular direction." Maka-Dai-Dai and Tai both have one,
// and both also have a hook mover, so the two turns are the same rule applied
// to different families.
describe('the Capricorn turns within the diagonals', () => {
  const capricorn = () => bent({ first: 'diagonal', firstSteps: 'any', second: 'perpendicular', minSecondLeg: 0 })
  const reachCap = (board) => new Set(capricorn().genMoves(topo, CENTRE, board).map(m => m.to))
  const colourOf = (i) => (Math.floor(i / N) + (i % N)) % 2

  test('reaches far more than a bishop', () => {
    const bishop = new Set()
    for (let k = 1; k < N; k++) {
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const r = 4 + dr * k, c = 4 + dc * k
        if (r >= 0 && r < N && c >= 0 && c < N) bishop.add(at(r, c))
      }
    }
    expect(reachCap(empty()).size).toBeGreaterThan(bishop.size)
  })

  test('stays on its own colour, because two diagonal moves cannot leave it', () => {
    // This is the check that a perpendicular turn was taken rather than an
    // orthogonal one: decomposing a diagonal into its components - which is
    // what the xiangqi elephant does - would put it on the other colour.
    const home = colourOf(CENTRE)
    expect([...reachCap(empty())].every(i => colourOf(i) === home)).toBe(true)
  })

  test('a decomposing turn still leaves the diagonal, which is the difference', () => {
    // The same shape with the default continuation turns onto one of the
    // diagonal's orthogonal components - what the xiangqi elephant and cannon
    // do - and that lands on the other colour. It is the one observable that
    // separates the two turns.
    const decomposing = bent({ first: 'diagonal', firstSteps: 'any', minSecondLeg: 0 })
    const dest = new Set(decomposing.genMoves(topo, CENTRE, empty()).map(m => m.to))
    const home = colourOf(CENTRE)
    expect([...dest].some(i => colourOf(i) !== home)).toBe(true)
  })
})
