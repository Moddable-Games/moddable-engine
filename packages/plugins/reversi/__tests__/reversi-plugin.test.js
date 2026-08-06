import { createReversiPlugin } from '../src/reversi-plugin.js'

function makePlugin(config = {}) {
  const plugin = createReversiPlugin({ rows: 8, cols: 8, ...config })
  const slice = plugin.init({ setup: null }, { request: () => null })
  return { plugin, slice }
}

function idx(row, col) {
  return row * 8 + col
}

function disc(owner) {
  return { type: 'disc', owner }
}

// Mirrors the standard setup FEN "8/8/8/3bw3/3wb3/8/8/8",
// where b is player 0 (black, moves first) and w is player 1.
function openingBoard() {
  const board = new Array(64).fill(null)
  board[idx(3, 3)] = disc(0)
  board[idx(3, 4)] = disc(1)
  board[idx(4, 3)] = disc(1)
  board[idx(4, 4)] = disc(0)
  return board
}

const asPlayer = (i) => ({ __players: { currentIndex: i } })

describe('reversi plugin', () => {
  test('exposes the plugin contract', () => {
    const { plugin } = makePlugin()
    expect(plugin.sliceName).toBe('reversi')
    expect(plugin.pieceTypes).toEqual(['disc'])
    expect(typeof plugin.validateMove).toBe('function')
    expect(typeof plugin.applyMove).toBe('function')
    expect(typeof plugin.getLegalMoves).toBe('function')
    expect(typeof plugin.checkWin).toBe('function')
  })

  test('opening position offers exactly four legal moves', () => {
    const { plugin } = makePlugin()
    const slice = { board: openingBoard(), passes: 0 }
    const moves = plugin.getLegalMoves(slice, asPlayer(0))
    expect(moves).toHaveLength(4)
    const coords = moves.map(m => m.coord).sort((a, b) => a - b)
    expect(coords).toEqual([idx(2, 4), idx(3, 5), idx(4, 2), idx(5, 3)].sort((a, b) => a - b))
  })

  test('placing flips the flanked disc', () => {
    const { plugin } = makePlugin()
    const slice = { board: openingBoard(), passes: 0 }
    const next = plugin.applyMove({ action: 'place', coord: idx(2, 4) }, slice, asPlayer(0))
    expect(next.board[idx(2, 4)].owner).toBe(0)
    expect(next.board[idx(3, 4)].owner).toBe(0)
    expect(next.lastFlipped).toEqual([idx(3, 4)])
  })

  test('rejects placement that flips nothing', () => {
    const { plugin } = makePlugin()
    const slice = { board: openingBoard(), passes: 0 }
    expect(plugin.validateMove({ action: 'place', coord: idx(0, 0) }, slice, asPlayer(0))).toBe(false)
  })

  test('rejects placement on an occupied cell', () => {
    const { plugin } = makePlugin()
    const slice = { board: openingBoard(), passes: 0 }
    expect(plugin.validateMove({ action: 'place', coord: idx(3, 3) }, slice, asPlayer(0))).toBe(false)
  })

  test('offers a pass only when the mover has no legal placement', () => {
    const { plugin } = makePlugin()
    const board = new Array(64).fill(null)
    board[idx(0, 0)] = disc(1)
    board[idx(0, 1)] = disc(1)
    board[idx(0, 2)] = disc(0)
    const slice = { board, passes: 0 }
    const moves = plugin.getLegalMoves(slice, asPlayer(0))
    expect(moves).toEqual([{ action: 'pass' }])
    expect(plugin.validateMove({ action: 'pass' }, slice, asPlayer(0))).toBe(true)
  })

  test('most discs wins when the board is full', () => {
    const { plugin } = makePlugin()
    const board = new Array(64).fill(null).map((_, i) => disc(i < 40 ? 0 : 1))
    expect(plugin.checkWin({ board, passes: 0 }, asPlayer(0))).toBe(0)
  })

  test('equal discs on a full board is a draw', () => {
    const { plugin } = makePlugin()
    const board = new Array(64).fill(null).map((_, i) => disc(i < 32 ? 0 : 1))
    expect(plugin.checkWin({ board, passes: 0 }, asPlayer(0))).toBe('draw')
  })

  test('winBy fewest inverts the outcome', () => {
    const { plugin } = makePlugin({ winBy: 'fewest' })
    const board = new Array(64).fill(null).map((_, i) => disc(i < 40 ? 0 : 1))
    expect(plugin.checkWin({ board, passes: 0 }, asPlayer(0))).toBe(1)
  })

  test('wipeout ends the game before the board fills', () => {
    const { plugin } = makePlugin()
    const board = new Array(64).fill(null)
    board[idx(3, 3)] = disc(1)
    board[idx(3, 4)] = disc(1)
    expect(plugin.checkWin({ board, passes: 0 }, asPlayer(0))).toBe(1)
  })

  test('orthogonal directions exclude diagonal flips', () => {
    const { plugin } = makePlugin({ directions: 'orthogonal' })
    const board = new Array(64).fill(null)
    board[idx(4, 4)] = disc(1)
    board[idx(5, 5)] = disc(0)
    const slice = { board, passes: 0 }
    expect(plugin.validateMove({ action: 'place', coord: idx(3, 3) }, slice, asPlayer(0))).toBe(false)
  })

  test('carries declarative config through from frontmatter', () => {
    const { plugin } = makePlugin({ winBy: 'fewest', directions: 'orthogonal' })
    expect(plugin.config.winBy).toBe('fewest')
    expect(plugin.config.directions).toBe('orthogonal')
  })
})
