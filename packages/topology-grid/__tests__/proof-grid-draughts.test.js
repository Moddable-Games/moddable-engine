import { createGridTopology } from '../src/topology-grid.js'
import { jump } from '../../piece-behaviour/src/movement-primitives.js'
import { createRegistry } from '../../core/src/plugin-registry.js'
import { createStore } from '../../core/src/state-store.js'
import { createHistory } from '../../core/src/history.js'
import { createPlayerSystem } from '../../core/src/player-system.js'
import { createEventBus } from '../../core/src/event-bus.js'
import { createPipeline } from '../../core/src/move-pipeline.js'

const topology = createGridTopology({ rows: 8, cols: 8 })

function annotateBoard(board, currentPlayer) {
  return board.map(p => {
    if (!p) return null
    return { ...p, friendly: p.owner === currentPlayer, enemy: p.owner !== currentPlayer }
  })
}

function getJumps(topology, from, board, directions) {
  const pairs = topology.jumpPairs(from, directions)
  return jump(pairs, from, board)
}

function getDiagMoves(topology, from, board, directions) {
  const moves = []
  const [r, c] = topology.toRC(from)
  for (const [dr, dc] of directions) {
    let nr = r + dr, nc = c + dc
    if (!topology.onBoard(nr, nc)) continue
    const sq = topology.toIndex(nr, nc)
    if (!board[sq]) moves.push({ from, to: sq })
  }
  return moves
}

const draughtsPlugin = {
  sliceName: 'draughts',
  init(config) {
    return { board: config.board || new Array(64).fill(null), mustJump: false }
  },
  validateMove(move, slice, full) {
    const currentPlayer = full.__players.currentIndex === 0 ? 'white' : 'black'
    const piece = slice.board[move.from]
    if (!piece || piece.owner !== currentPlayer) return false
    const annotated = annotateBoard(slice.board, currentPlayer)

    const fwdDirs = currentPlayer === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
    const jumps = getJumps(topology, move.from, annotated, fwdDirs)

    if (jumps.length > 0) return jumps.some(j => j.to === move.to)
    if (slice.mustJump) return false

    const allJumps = []
    for (let i = 0; i < 64; i++) {
      const p = slice.board[i]
      if (!p || p.owner !== currentPlayer) continue
      const dirs = currentPlayer === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
      allJumps.push(...getJumps(topology, i, annotated, dirs))
    }
    if (allJumps.length > 0) return false

    const simpleMoves = getDiagMoves(topology, move.from, slice.board, fwdDirs)
    return simpleMoves.some(m => m.to === move.to)
  },
  applyMove(move, slice, full) {
    const board = [...slice.board]
    const currentPlayer = full.__players.currentIndex === 0 ? 'white' : 'black'
    board[move.to] = board[move.from]
    board[move.from] = null

    if (move.captured !== undefined) {
      board[move.captured] = null
    } else {
      const dr = topology.toRC(move.to)[0] - topology.toRC(move.from)[0]
      const dc = topology.toRC(move.to)[1] - topology.toRC(move.from)[1]
      if (Math.abs(dr) === 2) {
        const midR = topology.toRC(move.from)[0] + dr / 2
        const midC = topology.toRC(move.from)[1] + dc / 2
        board[topology.toIndex(midR, midC)] = null
      }
    }

    const annotated = annotateBoard(board, currentPlayer)
    const fwdDirs = currentPlayer === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
    const chainJumps = getJumps(topology, move.to, annotated, fwdDirs)
    const wasCapture = move.captured !== undefined || Math.abs(topology.toRC(move.to)[0] - topology.toRC(move.from)[0]) === 2
    const mustJump = wasCapture && chainJumps.length > 0

    const newState = { board, mustJump }
    return { state: newState, continueTurn: mustJump }
  },
  getLegalMoves(slice, full) {
    const currentPlayer = full.__players.currentIndex === 0 ? 'white' : 'black'
    const annotated = annotateBoard(slice.board, currentPlayer)
    const fwdDirs = currentPlayer === 'white' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]
    const allJumps = []
    const allMoves = []

    for (let i = 0; i < 64; i++) {
      const p = slice.board[i]
      if (!p || p.owner !== currentPlayer) continue
      const jumps = getJumps(topology, i, annotated, fwdDirs)
      allJumps.push(...jumps)
      if (!slice.mustJump) {
        allMoves.push(...getDiagMoves(topology, i, slice.board, fwdDirs))
      }
    }

    return allJumps.length > 0 ? allJumps : allMoves
  },
  checkWin(slice, full) {
    const opponent = full.__players.currentIndex === 0 ? 'black' : 'white'
    const player = full.__players.currentIndex === 0 ? 'white' : 'black'
    const opponentPieces = slice.board.filter(p => p && p.owner === opponent).length
    if (opponentPieces === 0) return player
    return null
  },
}

describe('proof: grid-draughts (topology-grid + jump primitive + continueTurn)', () => {
  let pipeline, store, history, playerSystem

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(draughtsPlugin)
    playerSystem = createPlayerSystem({ players: ['white', 'black'] })
    store = createStore({})
    registry.initAll({ draughts: { board: new Array(64).fill(null) } }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    pipeline = createPipeline(registry, store, history, playerSystem, createEventBus())
  })

  test('single diagonal move forward', () => {
    const board = new Array(64).fill(null)
    board[topology.toIndex(5, 2)] = { type: 'man', owner: 'white' }
    store.set('draughts', { board, mustJump: false }, 'draughts')

    const result = pipeline.execute({ from: topology.toIndex(5, 2), to: topology.toIndex(4, 1) })
    expect(result.ok).toBe(true)
    expect(store.get('draughts').board[topology.toIndex(4, 1)].owner).toBe('white')
  })

  test('jump capture removes enemy piece', () => {
    const board = new Array(64).fill(null)
    board[topology.toIndex(5, 2)] = { type: 'man', owner: 'white' }
    board[topology.toIndex(4, 1)] = { type: 'man', owner: 'black' }
    store.set('draughts', { board, mustJump: false }, 'draughts')

    const result = pipeline.execute({ from: topology.toIndex(5, 2), to: topology.toIndex(3, 0) })
    expect(result.ok).toBe(true)
    expect(store.get('draughts').board[topology.toIndex(4, 1)]).toBeNull()
    expect(store.get('draughts').board[topology.toIndex(3, 0)].owner).toBe('white')
  })

  test('forced capture: must jump when available', () => {
    const board = new Array(64).fill(null)
    board[topology.toIndex(5, 2)] = { type: 'man', owner: 'white' }
    board[topology.toIndex(5, 4)] = { type: 'man', owner: 'white' }
    board[topology.toIndex(4, 3)] = { type: 'man', owner: 'black' }
    store.set('draughts', { board, mustJump: false }, 'draughts')

    const result = pipeline.execute({ from: topology.toIndex(5, 2), to: topology.toIndex(4, 1) })
    expect(result.ok).toBe(false)
  })

  test('chain capture uses continueTurn', () => {
    const board = new Array(64).fill(null)
    board[topology.toIndex(5, 0)] = { type: 'man', owner: 'white' }
    board[topology.toIndex(4, 1)] = { type: 'man', owner: 'black' }
    board[topology.toIndex(2, 3)] = { type: 'man', owner: 'black' }
    store.set('draughts', { board, mustJump: false }, 'draughts')

    const r1 = pipeline.execute({ from: topology.toIndex(5, 0), to: topology.toIndex(3, 2) })
    expect(r1.ok).toBe(true)
    expect(r1.continueTurn).toBe(true)
    expect(playerSystem.current(store)).toBe('white')

    // Verify first capture removed the piece
    expect(store.get('draughts').board[topology.toIndex(4, 1)]).toBeNull()

    const r2 = pipeline.execute({ from: topology.toIndex(3, 2), to: topology.toIndex(1, 4) })
    expect(r2.ok).toBe(true)
    // Verify second capture removed the piece
    expect(store.get('draughts').board[topology.toIndex(2, 3)]).toBeNull()
    // No more jumps from (1,4), turn should end
    expect(r2.continueTurn).toBe(false)
  })

  test('all pieces captured = win', () => {
    const board = new Array(64).fill(null)
    board[topology.toIndex(5, 0)] = { type: 'man', owner: 'white' }
    board[topology.toIndex(4, 1)] = { type: 'man', owner: 'black' }
    store.set('draughts', { board, mustJump: false }, 'draughts')

    const result = pipeline.execute({ from: topology.toIndex(5, 0), to: topology.toIndex(3, 2) })
    expect(result.winner).toBe('white')
  })
})
