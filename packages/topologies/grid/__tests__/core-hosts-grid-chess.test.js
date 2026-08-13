import { createGridTopology } from '../src/topology-grid.js'
import { slide, leap } from '../../../piece-behaviour/src/movement-primitives.js'
import { createPieceRegistry } from '../../../piece-behaviour/src/piece-registry.js'

const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const ALL_DIRS = [...ORTHOGONAL, ...DIAGONAL]
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'

const topology = createGridTopology({ rows: 8, cols: 8 })
const pieces = createPieceRegistry()

pieces.register('K', { genMoves: (t, from, board) => slide(t.rays(from, ALL_DIRS), from, board, { maxSteps: 1 }) })
pieces.register('Q', { genMoves: (t, from, board) => slide(t.rays(from, ALL_DIRS), from, board) })
pieces.register('R', { genMoves: (t, from, board) => slide(t.rays(from, ORTHOGONAL), from, board) })
pieces.register('B', { genMoves: (t, from, board) => slide(t.rays(from, DIAGONAL), from, board) })
pieces.register('N', { genMoves: (t, from, board) => leap(t.leapTargets(from, KNIGHT), from, board) })

function makeBoard(placements) {
  const board = new Array(64).fill(null)
  for (const [sq, piece] of Object.entries(placements)) {
    board[Number(sq)] = piece
  }
  return board
}

function annotateBoard(board, currentPlayer) {
  return board.map(p => {
    if (!p) return null
    return { ...p, friendly: p.owner === currentPlayer, enemy: p.owner !== currentPlayer }
  })
}

const chessGridPlugin = {
  sliceName: 'chess',
  init(config) {
    return {
      board: makeBoard(config.pieces || {}),
      captured: [],
    }
  },
  validateMove(move, slice, full) {
    const currentPlayer = full.__players.currentIndex === 0 ? 'white' : 'black'
    const piece = slice.board[move.from]
    if (!piece || piece.owner !== currentPlayer) return false
    const annotated = annotateBoard(slice.board, currentPlayer)
    const legal = pieces.genMoves(piece.type, topology, move.from, annotated)
    return legal.some(m => m.to === move.to)
  },
  applyMove(move, slice) {
    const board = [...slice.board]
    const captured = [...slice.captured]
    if (board[move.to]) captured.push(board[move.to])
    board[move.to] = board[move.from]
    board[move.from] = null
    return { board, captured }
  },
  getLegalMoves(slice, full) {
    const currentPlayer = full.__players.currentIndex === 0 ? 'white' : 'black'
    const annotated = annotateBoard(slice.board, currentPlayer)
    const moves = []
    for (let i = 0; i < 64; i++) {
      const p = slice.board[i]
      if (!p || p.owner !== currentPlayer) continue
      const pieceMoves = pieces.genMoves(p.type, topology, i, annotated)
      for (const m of pieceMoves) moves.push(m)
    }
    return moves
  },
  checkWin(slice) {
    const hasWhiteKing = slice.board.some(p => p && p.type === 'K' && p.owner === 'white')
    const hasBlackKing = slice.board.some(p => p && p.type === 'K' && p.owner === 'black')
    if (!hasWhiteKing) return 'black'
    if (!hasBlackKing) return 'white'
    return null
  },
}

describe('proof: grid-chess (topology-grid + piece-behaviour + core)', () => {
  let pipeline, store, history, playerSystem

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(chessGridPlugin)
    playerSystem = createPlayerSystem({ players: ['white', 'black'] })
    store = createStore({})
    registry.initAll({
      chess: {
        pieces: {
          [topology.toIndex(7, 4)]: { type: 'K', owner: 'white' },
          [topology.toIndex(7, 3)]: { type: 'Q', owner: 'white' },
          [topology.toIndex(7, 0)]: { type: 'R', owner: 'white' },
          [topology.toIndex(7, 7)]: { type: 'R', owner: 'white' },
          [topology.toIndex(7, 2)]: { type: 'B', owner: 'white' },
          [topology.toIndex(7, 5)]: { type: 'B', owner: 'white' },
          [topology.toIndex(7, 1)]: { type: 'N', owner: 'white' },
          [topology.toIndex(7, 6)]: { type: 'N', owner: 'white' },
          [topology.toIndex(0, 4)]: { type: 'K', owner: 'black' },
          [topology.toIndex(0, 3)]: { type: 'Q', owner: 'black' },
          [topology.toIndex(0, 0)]: { type: 'R', owner: 'black' },
          [topology.toIndex(0, 7)]: { type: 'R', owner: 'black' },
          [topology.toIndex(0, 2)]: { type: 'B', owner: 'black' },
          [topology.toIndex(0, 5)]: { type: 'B', owner: 'black' },
          [topology.toIndex(0, 1)]: { type: 'N', owner: 'black' },
          [topology.toIndex(0, 6)]: { type: 'N', owner: 'black' },
        },
      },
    }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    pipeline = createPipeline(registry, store, history, playerSystem, createEventBus())
  })

  test('knight moves from b1 (no pawns blocking)', () => {
    const from = topology.toIndex(7, 1)
    const moves = pipeline.getLegalMoves().filter(m => m.from === from)
    // No pawns on row 6, so knight can reach a3, c3, and d2
    expect(moves).toHaveLength(3)
    expect(moves.map(m => m.to)).toContain(topology.toIndex(5, 0))
    expect(moves.map(m => m.to)).toContain(topology.toIndex(5, 2))
  })

  test('rook slides along open file (no pawns blocking)', () => {
    const from = topology.toIndex(7, 0)
    const moves = pipeline.getLegalMoves().filter(m => m.from === from)
    // No pawns, rook slides up entire a-file until hitting black rook at a8
    expect(moves.length).toBeGreaterThan(0)
    expect(moves[moves.length - 1].to).toBe(topology.toIndex(0, 0))
    expect(moves[moves.length - 1].capture).toBe(true)
  })

  test('queen slides along open lines (no pawns blocking)', () => {
    const from = topology.toIndex(7, 3)
    const moves = pipeline.getLegalMoves().filter(m => m.from === from)
    expect(moves.length).toBeGreaterThan(0)
  })

  test('knight move executes through pipeline', () => {
    const from = topology.toIndex(7, 1)
    const to = topology.toIndex(5, 2)
    const result = pipeline.execute({ from, to })
    expect(result.ok).toBe(true)
    expect(store.get('chess').board[to].type).toBe('N')
    expect(store.get('chess').board[from]).toBeNull()
  })

  test('invalid move rejected', () => {
    const from = topology.toIndex(7, 1)
    const to = topology.toIndex(3, 3)
    const result = pipeline.execute({ from, to })
    expect(result.ok).toBe(false)
  })

  test('capture removes enemy piece', () => {
    store.set('chess', {
      board: makeBoard({
        [topology.toIndex(3, 3)]: { type: 'R', owner: 'white' },
        [topology.toIndex(3, 7)]: { type: 'R', owner: 'black' },
        [topology.toIndex(0, 0)]: { type: 'K', owner: 'white' },
        [topology.toIndex(7, 7)]: { type: 'K', owner: 'black' },
      }),
      captured: [],
    }, 'chess')
    const result = pipeline.execute({ from: topology.toIndex(3, 3), to: topology.toIndex(3, 7) })
    expect(result.ok).toBe(true)
    expect(store.get('chess').captured).toHaveLength(1)
    expect(store.get('chess').board[topology.toIndex(3, 7)].owner).toBe('white')
  })

  test('king capture triggers win', () => {
    store.set('chess', {
      board: makeBoard({
        [topology.toIndex(3, 3)]: { type: 'Q', owner: 'white' },
        [topology.toIndex(3, 7)]: { type: 'K', owner: 'black' },
        [topology.toIndex(7, 7)]: { type: 'K', owner: 'white' },
      }),
      captured: [],
    }, 'chess')
    const result = pipeline.execute({ from: topology.toIndex(3, 3), to: topology.toIndex(3, 7) })
    expect(result.winner).toBe('white')
  })

  test('bishop slides diagonally', () => {
    store.set('chess', {
      board: makeBoard({
        [topology.toIndex(4, 4)]: { type: 'B', owner: 'white' },
        [topology.toIndex(0, 0)]: { type: 'K', owner: 'white' },
        [topology.toIndex(7, 7)]: { type: 'K', owner: 'black' },
      }),
      captured: [],
    }, 'chess')
    const moves = pipeline.getLegalMoves().filter(m => m.from === topology.toIndex(4, 4))
    // 13 diagonal squares minus 1 blocked by own king at a1 = can't reach a1 but stops before
    expect(moves.length).toBeGreaterThan(10)
    expect(moves.some(m => m.to === topology.toIndex(0, 0))).toBe(false)
  })

  test('undo restores captured piece', () => {
    store.set('chess', {
      board: makeBoard({
        [topology.toIndex(3, 3)]: { type: 'R', owner: 'white' },
        [topology.toIndex(3, 7)]: { type: 'N', owner: 'black' },
        [topology.toIndex(0, 0)]: { type: 'K', owner: 'white' },
        [topology.toIndex(7, 7)]: { type: 'K', owner: 'black' },
      }),
      captured: [],
    }, 'chess')
    pipeline.execute({ from: topology.toIndex(3, 3), to: topology.toIndex(3, 7) })
    history.undo(store)
    expect(store.get('chess').board[topology.toIndex(3, 7)].type).toBe('N')
    expect(store.get('chess').board[topology.toIndex(3, 7)].owner).toBe('black')
  })
})
