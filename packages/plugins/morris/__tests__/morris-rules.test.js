import { createMorrisPlugin } from '../index.js'
import { concentricRings } from '../../../topologies/graph/index.js'

// Positions are built from the rules text in moddable-rules rather than
// captured from a run. The node order is fixed by the renderer: per ring,
// outermost first, corners TL TR BR BL then midpoints top right bottom left,
// so on a nine men's board n1 is the outer top-left corner and n5 is the outer
// top midpoint. n1-n5-n2 is therefore the top side of the outer square, and a
// mill.
function board(config = {}) {
  const plugin = createMorrisPlugin(config)
  const slice = plugin.init()
  return { plugin, slice }
}

const turn = index => ({ __players: { currentIndex: index } })

function occupy(slice, assignments) {
  for (const [node, player] of Object.entries(assignments)) slice.board[node] = player
  return slice
}

describe('the board itself', () => {
  it('gives nine mens morris 24 points and 16 mills', () => {
    const g = concentricRings({ rings: 3, midpoints: true })
    expect(g.nodes).toHaveLength(24)
    expect(g.mills).toHaveLength(16)
  })

  it('gives twelve mens morris four more mills, from the corner diagonals', () => {
    const g = concentricRings({ rings: 3, midpoints: true, diagonals: true })
    expect(g.nodes).toHaveLength(24)
    expect(g.mills).toHaveLength(20)
  })

  it('gives six mens morris 16 points and no spoke mills', () => {
    const g = concentricRings({ rings: 2, midpoints: true })
    expect(g.nodes).toHaveLength(16)
    expect(g.mills).toHaveLength(8)
  })

  it('makes a single ring with midpoints a 3x3 grid, centre included', () => {
    const g = concentricRings({ rings: 1, midpoints: true })
    expect(g.nodes).toHaveLength(9)
    // three rows and three columns would be six, but the ring's own four sides
    // are the outer rows and columns, so: 4 sides + middle row + middle column.
    expect(g.mills).toHaveLength(6)
  })

  it('joins every point to at least two others', () => {
    const g = concentricRings({ rings: 3, midpoints: true })
    const degree = new Map(g.nodes.map(n => [n, 0]))
    for (const [a, b] of g.edges) { degree.set(a, degree.get(a) + 1); degree.set(b, degree.get(b) + 1) }
    expect([...degree.values()].filter(d => d < 2)).toEqual([])
  })

  it('never puts the same point in a mill twice', () => {
    const g = concentricRings({ rings: 3, midpoints: true, diagonals: true })
    for (const mill of g.mills) expect(new Set(mill).size).toBe(3)
  })
})

describe('mills and removal', () => {
  it('offers a removal with the move that closes a mill', () => {
    const { plugin, slice } = board()
    occupy(slice, { n1: 0, n5: 0, n9: 1 })          // white two along the top, black loose
    slice.placed = [2, 1]
    const closing = plugin.getLegalMoves(slice, turn(0)).filter(m => m.to === 'n2')
    expect(closing.length).toBeGreaterThan(0)
    for (const m of closing) expect(m.remove).toBe('n9')
  })

  it('offers no removal for a move that closes nothing', () => {
    const { plugin, slice } = board()
    occupy(slice, { n1: 0, n9: 1 })
    slice.placed = [1, 1]
    const quiet = plugin.getLegalMoves(slice, turn(0)).find(m => m.to === 'n3')
    expect(quiet.remove).toBeUndefined()
  })

  it('spares a piece standing in a mill while a loose one exists', () => {
    const { plugin, slice } = board()
    occupy(slice, { n1: 0, n5: 0, n9: 1, n13: 1, n10: 1, n17: 1 })
    slice.placed = [2, 4]
    // black holds n9-n13-n10 (middle ring top side); n17 is loose.
    const closing = plugin.getLegalMoves(slice, turn(0)).filter(m => m.to === 'n2')
    expect(closing.map(m => m.remove)).toEqual(['n17'])
  })

  it('allows taking from a mill once nothing else is left', () => {
    const { plugin, slice } = board()
    occupy(slice, { n1: 0, n5: 0, n9: 1, n13: 1, n10: 1 })
    slice.placed = [2, 3]
    const closing = plugin.getLegalMoves(slice, turn(0)).filter(m => m.to === 'n2')
    expect(closing.map(m => m.remove).sort()).toEqual(['n10', 'n13', 'n9'])
  })

  it('ignores mill protection where the variant says so, as in shax', () => {
    const { plugin, slice } = board({ millProtection: false })
    occupy(slice, { n1: 0, n5: 0, n9: 1, n13: 1, n10: 1, n17: 1 })
    slice.placed = [2, 4]
    const closing = plugin.getLegalMoves(slice, turn(0)).filter(m => m.to === 'n2')
    expect(closing.map(m => m.remove).sort()).toEqual(['n10', 'n13', 'n17', 'n9'])
  })

  it('takes nothing during placement where placement is peaceful, as in shax', () => {
    const { plugin, slice } = board({ millRemovesDuringPlacement: false, piecesPerPlayer: 12 })
    occupy(slice, { n1: 0, n5: 0, n9: 1 })
    slice.placed = [2, 1]
    const closing = plugin.getLegalMoves(slice, turn(0)).filter(m => m.to === 'n2')
    expect(closing.length).toBeGreaterThan(0)
    for (const m of closing) expect(m.remove).toBeUndefined()
  })
})

describe('movement', () => {
  it('moves only to a joined point once placement is over', () => {
    const { plugin, slice } = board({ piecesPerPlayer: 3, flying: false })
    occupy(slice, { n1: 0, n3: 0, n4: 0, n2: 1, n6: 1, n7: 1 })
    slice.placed = [3, 3]
    const from1 = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === 'n1').map(m => m.to)
    // n1 is the outer top-left corner, joined to the top and left midpoints.
    expect(from1.sort()).toEqual(['n5', 'n8'])
  })

  it('lets a player reduced to three fly anywhere empty', () => {
    const { plugin, slice } = board({ piecesPerPlayer: 9, flying: true, flyingAt: 3 })
    occupy(slice, { n1: 0, n3: 0, n4: 0, n2: 1, n6: 1, n7: 1, n10: 1 })
    slice.placed = [9, 9]
    const from1 = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === 'n1')
    expect(from1.length).toBeGreaterThan(2)
  })

  it('moves anywhere from the start where the variant says so, as in three mens morris', () => {
    const { plugin, slice } = board({ rings: 1, piecesPerPlayer: 3, movement: 'anywhere', winOnMill: true })
    occupy(slice, { n1: 0, n3: 0, n6: 0, n2: 1, n4: 1, n7: 1 })
    slice.placed = [3, 3]
    const empties = Object.entries(slice.board).filter(([, v]) => v == null).length
    const from1 = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === 'n1')
    expect(from1).toHaveLength(empties)
  })
})

describe('ending', () => {
  it('is won when the opponent is reduced below the floor', () => {
    const { plugin, slice } = board({ piecesPerPlayer: 9, loseAt: 2 })
    occupy(slice, { n1: 0, n3: 0, n4: 0, n2: 1, n6: 1 })
    slice.placed = [9, 9]
    expect(plugin.checkWin(slice, turn(0))).toBe(0)
  })

  it('is not won while pieces are still to be placed', () => {
    const { plugin, slice } = board({ piecesPerPlayer: 9 })
    occupy(slice, { n1: 0, n2: 1 })
    slice.placed = [1, 1]
    expect(plugin.checkWin(slice, turn(0))).toBeNull()
  })

  it('is won outright by a line where the variant says so, as in three mens morris', () => {
    const { plugin, slice } = board({ rings: 1, piecesPerPlayer: 3, movement: 'anywhere', winOnMill: true })
    occupy(slice, { n1: 0, n5: 0, n2: 0 })
    slice.placed = [3, 1]
    expect(plugin.checkWin(slice, turn(1))).toBe(0)
  })
})

describe('lasker morris', () => {
  it('offers placing and moving on the same turn', () => {
    const { plugin, slice } = board({ piecesPerPlayer: 10, interleavedPlacement: true })
    occupy(slice, { n1: 0, n2: 1 })
    slice.placed = [1, 1]
    const moves = plugin.getLegalMoves(slice, turn(0))
    expect(moves.some(m => m.action === 'place')).toBe(true)
    expect(moves.some(m => m.action === 'move')).toBe(true)
  })
})
