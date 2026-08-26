import { createHexPlugin } from '../index.js'
import { createHexTopology, triangularCells, rhombusCells } from '../../../topologies/hex/index.js'

// Cells are keyed "q,r". On a rhombus of size n, r selects the row and q the
// column, so north is r = 0, south is r = n - 1, west is q = 0 and east is
// q = n - 1. On a triangle, row 0 is the apex and row n has n + 1 cells.
function game(config) {
  const plugin = createHexPlugin(config)
  return { plugin, slice: plugin.init() }
}

const HEX5 = { shape: 'rhombus', rows: 5, cols: 5 }
const Y4 = { shape: 'triangular', sideLength: 4 }

describe('the boards', () => {
  it('builds a rhombus from the rows and cols the corpus declares', () => {
    // The generator only ever read `size`, so every hex variant in the corpus
    // produced a board with no cells at all.
    expect(createHexTopology({ shape: 'rhombus', rows: 11, cols: 11 }).size).toBe(121)
    expect(createHexTopology({ shape: 'rhombus', rows: 19, cols: 19 }).size).toBe(361)
  })

  it('builds a triangle of the declared side length', () => {
    for (const side of [4, 9, 12, 15]) {
      expect(triangularCells(side)).toHaveLength((side * (side + 1)) / 2)
    }
  })

  it('names four edges on a rhombus and three on a triangle', () => {
    expect(Object.keys(createHexTopology({ shape: 'rhombus', rows: 5, cols: 5 }).getEdges()).sort())
      .toEqual(['east', 'north', 'south', 'west'])
    expect(Object.keys(createHexTopology({ shape: 'triangular', sideLength: 5 }).getEdges()).sort())
      .toEqual(['base', 'left', 'right'])
  })

  it('puts the apex in both slanted edges of a triangle', () => {
    const edges = createHexTopology({ shape: 'triangular', sideLength: 5 }).getEdges()
    const apex = { q: 0, r: 0 }
    expect(edges.left).toContainEqual(apex)
    expect(edges.right).toContainEqual(apex)
  })

  it('gives an interior cell six neighbours', () => {
    expect(createHexTopology({ shape: 'rhombus', rows: 5, cols: 5 }).neighbours('2,2')).toHaveLength(6)
  })
})

describe('connection', () => {
  it('is won by joining north to south', () => {
    const { plugin, slice } = game(HEX5)
    for (let r = 0; r < 5; r++) slice.board[`2,${r}`] = 0
    expect(plugin.checkWin(slice)).toBe(0)
  })

  it('is won by the other player joining west to east', () => {
    const { plugin, slice } = game(HEX5)
    for (let q = 0; q < 5; q++) slice.board[`${q},2`] = 1
    expect(plugin.checkWin(slice)).toBe(1)
  })

  it('is not won by a chain one cell short', () => {
    const { plugin, slice } = game(HEX5)
    for (let r = 0; r < 4; r++) slice.board[`2,${r}`] = 0
    expect(plugin.checkWin(slice)).toBeNull()
  })

  it('is not won by a chain joining the wrong pair of edges', () => {
    // A north-south chain does nothing for the player who owns west and east.
    const { plugin, slice } = game(HEX5)
    for (let r = 0; r < 5; r++) slice.board[`2,${r}`] = 1
    expect(plugin.checkWin(slice)).toBeNull()
  })

  it('follows a crooked chain, not just a straight one', () => {
    const { plugin, slice } = game(HEX5)
    for (const cell of ['0,0', '0,1', '1,1', '1,2', '2,2', '2,3', '3,3', '3,4']) slice.board[cell] = 0
    expect(plugin.checkWin(slice)).toBe(0)
  })

  it('needs all three sides in Y, not two', () => {
    const { plugin, slice } = game(Y4)
    // Down the left edge to the base, avoiding the apex - which counts as both
    // slanted sides at once, so including it would win on a technicality this
    // test is not trying to make.
    for (const cell of ['-1,1', '-2,2', '-3,3']) slice.board[cell] = 0
    expect(plugin.checkWin(slice)).toBeNull()
  })

  it('counts the apex as touching both slanted sides', () => {
    // Apex plus the base corner beneath it: left, right and base, all three.
    const { plugin, slice } = game(Y4)
    for (const cell of ['0,0', '-1,1', '-2,2', '-3,3']) slice.board[cell] = 0
    expect(plugin.checkWin(slice)).toBe(0)
  })

  it('is won in Y by a chain touching all three sides', () => {
    const { plugin, slice } = game(Y4)
    // The whole base plus a climb to the apex, which is in both slanted edges.
    for (const cell of ['-3,3', '-2,3', '-1,3', '0,3', '0,2', '0,1', '0,0']) slice.board[cell] = 0
    expect(plugin.checkWin(slice)).toBe(0)
  })
})

// Hex and Y share a theorem: a full board always contains exactly one winning
// connection, so neither game can be drawn. It is the strongest statement
// available about whether the adjacency and the edge sets are right, because a
// single wrong neighbour breaks it.
describe('the no-draw property', () => {
  function fillPseudoRandomly(plugin, seed) {
    const slice = plugin.init()
    let x = seed
    for (const cell of Object.keys(slice.board)) {
      x = (x * 1103515245 + 12345) & 0x7fffffff
      slice.board[cell] = x % 2
    }
    return slice
  }

  it.each([
    ['hex 5x5', HEX5],
    ['hex 7x7', { shape: 'rhombus', rows: 7, cols: 7 }],
    ['y side 6', { shape: 'triangular', sideLength: 6 }],
  ])('%s: every full board has a winner', (_label, config) => {
    const plugin = createHexPlugin(config)
    const drawn = []
    for (let seed = 1; seed <= 200; seed++) {
      if (plugin.checkWin(fillPseudoRandomly(plugin, seed)) === null) drawn.push(seed)
    }
    expect(drawn).toEqual([])
  })

  it('hex 7x7: never lets both players connect at once', () => {
    const plugin = createHexPlugin({ shape: 'rhombus', rows: 7, cols: 7 })
    const both = []
    for (let seed = 1; seed <= 200; seed++) {
      const slice = fillPseudoRandomly(plugin, seed)
      const winner = plugin.checkWin(slice)
      const other = 1 - winner
      const alone = plugin.init()
      for (const cell of Object.keys(slice.board)) {
        alone.board[cell] = slice.board[cell] === other ? other : null
      }
      if (plugin.checkWin(alone) === other) both.push(seed)
    }
    expect(both).toEqual([])
  })
})

describe('the swap rule', () => {
  it('is offered only after the opening stone, and only when declared', () => {
    const { plugin, slice } = game({ ...HEX5, swapRule: true })
    expect(plugin.getLegalMoves(slice, {}).some(m => m.action === 'swap')).toBe(false)
    const after = plugin.applyMove({ action: 'place', to: '2,2' }, slice, { __players: { currentIndex: 0 } })
    expect(plugin.getLegalMoves(after, {}).some(m => m.action === 'swap')).toBe(true)
  })

  it('is absent where the variant does not declare it', () => {
    const { plugin, slice } = game(HEX5)
    const after = plugin.applyMove({ action: 'place', to: '2,2' }, slice, { __players: { currentIndex: 0 } })
    expect(plugin.getLegalMoves(after, {}).some(m => m.action === 'swap')).toBe(false)
  })

  it('hands the opening stone to the player who swaps', () => {
    const { plugin, slice } = game({ ...HEX5, swapRule: true })
    const placed = plugin.applyMove({ action: 'place', to: '2,2' }, slice, { __players: { currentIndex: 0 } })
    const swapped = plugin.applyMove({ action: 'swap' }, placed, { __players: { currentIndex: 1 } })
    expect(swapped.board['2,2']).toBe(1)
    expect(plugin.getLegalMoves(swapped, {}).some(m => m.action === 'swap')).toBe(false)
  })
})
