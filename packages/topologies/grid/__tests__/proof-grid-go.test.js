import { createGridTopology } from '../src/topology-grid.js'
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'

const topology = createGridTopology({ rows: 9, cols: 9 })

function getGroup(board, idx) {
  const colour = board[idx]
  if (!colour) return { stones: [], liberties: 0 }
  const visited = new Set()
  const stack = [idx]
  let liberties = 0
  while (stack.length) {
    const pos = stack.pop()
    if (visited.has(pos)) continue
    visited.add(pos)
    for (const n of topology.neighbours(pos)) {
      if (board[n] === null) liberties++
      else if (board[n] === colour && !visited.has(n)) stack.push(n)
    }
  }
  return { stones: [...visited], liberties }
}

const goGridPlugin = {
  sliceName: 'go',
  init(config) {
    return { board: new Array(topology.size).fill(null), passes: 0, ko: null, captures: [0, 0] }
  },
  validateMove(move, slice) {
    if (move.action === 'pass') return true
    if (!topology.isValid(move.coord)) return false
    if (slice.board[move.coord] !== null) return false
    if (move.coord === slice.ko) return false
    return true
  },
  applyMove(move, slice, full) {
    if (move.action === 'pass') return { ...slice, passes: slice.passes + 1, ko: null }
    const board = [...slice.board]
    const playerIdx = full.__players.currentIndex
    const current = playerIdx === 0 ? 'black' : 'white'
    const opponent = current === 'black' ? 'white' : 'black'
    board[move.coord] = current

    let capturedCount = 0
    let lastCaptured = null
    for (const n of topology.neighbours(move.coord)) {
      if (board[n] === opponent) {
        const group = getGroup(board, n)
        if (group.liberties === 0) {
          for (const s of group.stones) { board[s] = null; capturedCount++ }
          if (group.stones.length === 1) lastCaptured = group.stones[0]
        }
      }
    }

    const ko = capturedCount === 1 ? lastCaptured : null
    const captures = [...slice.captures]
    captures[playerIdx] += capturedCount
    return { board, passes: 0, ko, captures }
  },
  getLegalMoves(slice, full) {
    const moves = [{ action: 'pass' }]
    for (let i = 0; i < topology.size; i++) {
      if (slice.board[i] === null && i !== slice.ko) moves.push({ coord: i })
    }
    return moves
  },
  checkWin(slice) {
    if (slice.passes >= 2) return 'scoring'
    return null
  },
}

describe('proof: grid-go (topology-grid + core)', () => {
  let pipeline, store, history, playerSystem

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(goGridPlugin)
    playerSystem = createPlayerSystem({ players: ['black', 'white'] })
    store = createStore({})
    registry.initAll({ go: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    pipeline = createPipeline(registry, store, history, playerSystem, createEventBus())
  })

  test('9x9 board uses topology.size', () => {
    expect(store.get('go').board).toHaveLength(81)
  })

  test('placement uses topology coordinates', () => {
    const coord = topology.toIndex(4, 4)
    pipeline.execute({ coord })
    expect(store.get('go').board[coord]).toBe('black')
  })

  test('topology.neighbours used for capture detection', () => {
    // Black stone at (1,1), surrounded on 3 sides by white
    // White plays the 4th neighbour to capture
    const center = topology.toIndex(1, 1)
    const ns = topology.neighbours(center) // 4 orthogonal neighbours
    const board = new Array(81).fill(null)
    board[center] = 'black'
    // White occupies first 3 neighbours
    for (let i = 0; i < ns.length - 1; i++) board[ns[i]] = 'white'
    store.set('go', { board, passes: 0, ko: null, captures: [0, 0] }, 'go')
    // Set to white's turn (index 1)
    playerSystem.advance(store)
    // White plays the last neighbour — captures the black stone
    pipeline.execute({ coord: ns[ns.length - 1] })
    expect(store.get('go').board[center]).toBeNull()
    expect(store.get('go').captures[1]).toBe(1)
  })

  test('corner stone has 2 neighbours (topology aware)', () => {
    expect(topology.neighbours(0)).toHaveLength(2)
    const board = new Array(81).fill(null)
    board[0] = 'black'
    const ns = topology.neighbours(0)
    for (const n of ns) board[n] = 'white'
    store.set('go', { board, passes: 0, ko: null, captures: [0, 0] }, 'go')
    playerSystem.advance(store)
    const group = getGroup(store.get('go').board, 0)
    expect(group.liberties).toBe(0)
  })

  test('edge stone has 3 neighbours', () => {
    const edge = topology.toIndex(0, 4)
    expect(topology.neighbours(edge)).toHaveLength(3)
  })

  test('pass-to-end via topology-agnostic pipeline', () => {
    pipeline.execute({ action: 'pass' })
    const result = pipeline.execute({ action: 'pass' })
    expect(result.winner).toBe('scoring')
  })

  test('large group capture uses topology traversal', () => {
    const board = new Array(81).fill(null)
    board[topology.toIndex(1, 1)] = 'black'
    board[topology.toIndex(1, 2)] = 'black'
    board[topology.toIndex(2, 1)] = 'black'

    const surround = [
      topology.toIndex(0, 1), topology.toIndex(0, 2),
      topology.toIndex(1, 0), topology.toIndex(1, 3),
      topology.toIndex(2, 0), topology.toIndex(2, 2),
      topology.toIndex(3, 1),
    ]
    for (const s of surround) board[s] = 'white'

    store.set('go', { board, passes: 0, ko: null, captures: [0, 0] }, 'go')
    playerSystem.advance(store)
    const group = getGroup(board, topology.toIndex(1, 1))
    expect(group.stones).toHaveLength(3)
    expect(group.liberties).toBe(0)
  })
})
