import '../../../play/test-helpers/setup-rules-reader.js'
import { createGridTopology } from '../../../topologies/grid/index.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#159. Spherical Chess treats the files as meridians meeting at two
// poles. A pole is a reflection, not a wrap: crossing one keeps the rank, moves
// half way round it, and reverses the direction of travel. The engine used to
// wrap the rank like a torus, so a Rook stepping off rank 1 arrived on rank 8.
//
// Every path below is transcribed from chessvariants.com/boardrules.dir/
// spherical.html (Duniho, 2021), which surveys the published versions. Where
// they disagree the variant's `disputed:` block records each reading; these
// are the ones the engine plays.

const t = createGridTopology({ rows: 8, cols: 8, wrap: 'spherical' })
const sq = (n) => (8 - Number(n[1])) * 8 + n.charCodeAt(0) - 97
const nm = (i) => String.fromCharCode(97 + (i % 8)) + (8 - ((i / 8) | 0))
const path = (from, dr, dc) => t.ray(sq(from), dr, dc).map(nm)
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]

describe('a pole is a reflection', () => {
  test('a Rook crosses to the same rank, four files along, and comes back', () => {
    // "Ra3-a1-e1-e4" - rank 1 again, not rank 8.
    expect(path('a3', 1, 0).slice(0, 5)).toEqual(['a2', 'a1', 'e1', 'e2', 'e3'])
  })

  test('a line through a file is a great circle of sixteen cells, not eight', () => {
    // The rider limit used to be the board's longest side, which cut every
    // great circle in half.
    const circle = path('a3', 1, 0)
    expect(circle).toHaveLength(15)
    expect(new Set(circle).size).toBe(15)
    expect(circle).not.toContain('a3')
  })

  test('a Bishop goes straight over and reverses, staying on its colour', () => {
    // "the Bishop starts at g3, goes south to f2 and e1, crosses the pole to
    // a1, continues north to b2, c3, and d4, crosses the equator to e5,
    // continues north to f6, g7, and h8, crosses the pole to d8, continues
    // south to c7, b6, and a5, crosses the equator to h4, and ends up at g3"
    expect(path('g3', 1, -1)).toEqual([
      'f2', 'e1', 'a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'd8', 'c7', 'b6', 'a5', 'h4',
    ])
  })

  test('a Knight has eight moves from every square', () => {
    // Miller's Knight on g2: "a1, a3, h4, f4, e3, e1, b1 or d1". On g1 the
    // original Global Chess card adds the two squares two files along the
    // same rank to Miller's six.
    const leap = (from) => t.leapTargets(sq(from), KNIGHT).map(nm).sort()
    expect(leap('g2')).toEqual(['a1', 'a3', 'b1', 'd1', 'e1', 'e3', 'f4', 'h4'])
    expect(leap('g1')).toEqual(['a1', 'a2', 'b2', 'd2', 'e1', 'e2', 'f3', 'h3'])
    for (let i = 0; i < 64; i++) expect([nm(i), t.leapTargets(i, KNIGHT).length]).toEqual([nm(i), 8])
  })

  test('a King beside a pole has six moves, not eight', () => {
    // "With this type of diagonal move, a King by a pole has only six possible
    // moves." Three of its directions all land on a1.
    const reach = new Set(t.rays(sq('e1'), 'all', 1).flat().map(nm))
    expect([...reach].sort()).toEqual(['a1', 'd1', 'd2', 'e2', 'f1', 'f2'])
  })

  test('a rank still wraps, and never onto its own square', () => {
    expect(path('a3', 0, 1)).toEqual(['b3', 'c3', 'd3', 'e3', 'f3', 'g3', 'h3'])
  })
})

describe('spherical chess', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'spherical-chess', rngSeed: 1 }) })

  test('opens as chess does', () => {
    expect(game.getLegalMoves()).toHaveLength(20)
  })

  test('a Rook on the first rank crosses the pole', () => {
    const cells = new Array(64).fill(null)
    cells[sq('d4')] = { type: 'king', owner: 0 }
    cells[sq('h6')] = { type: 'king', owner: 1 }
    cells[sq('a3')] = { type: 'rook', owner: 0 }
    const state = game.getState()
    game.loadState({ slice: { ...state.slice, board: cells, castlingRights: null }, players: { currentIndex: 0 } })
    const to = game.getLegalMoves().filter(m => m.from === sq('a3')).map(m => nm(m.to))
    expect(to).toEqual(expect.arrayContaining(['a1', 'e1', 'e2', 'e3']))
    expect(new Set(to).size).toBe(to.length)
  })

  test('a King beside a pole is offered each square once', () => {
    const cells = new Array(64).fill(null)
    cells[sq('e1')] = { type: 'king', owner: 0 }
    cells[sq('d6')] = { type: 'king', owner: 1 }
    const state = game.getState()
    game.loadState({ slice: { ...state.slice, board: cells, castlingRights: null }, players: { currentIndex: 0 } })
    const to = game.getLegalMoves().map(m => nm(m.to)).sort()
    expect(to).toEqual(['a1', 'd1', 'd2', 'e2', 'f1', 'f2'])
  })

  test('it keeps playing', () => {
    let plies = 0
    for (; plies < 80; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length || game.checkWin()) break
      game.applyMove(moves[(plies * 5) % moves.length])
    }
    expect(plies).toBeGreaterThan(20)
  })
})
