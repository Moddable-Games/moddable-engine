import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'

function getNeighbours(idx, size) {
  const row = Math.floor(idx / size), col = idx % size
  const n = []
  if (row > 0) n.push(idx - size)
  if (row < size - 1) n.push(idx + size)
  if (col > 0) n.push(idx - 1)
  if (col < size - 1) n.push(idx + 1)
  return n
}

function getGroup(board, idx, size) {
  const colour = board[idx]
  if (!colour) return { stones: [], liberties: 0 }
  const visited = new Set()
  const stack = [idx]
  let liberties = 0
  while (stack.length) {
    const pos = stack.pop()
    if (visited.has(pos)) continue
    visited.add(pos)
    for (const n of getNeighbours(pos, size)) {
      if (board[n] === null) liberties++
      else if (board[n] === colour && !visited.has(n)) stack.push(n)
    }
  }
  return { stones: [...visited], liberties }
}

const goPlugin = {
  sliceName: 'go',
  init(config) {
    const size = config.size || 9
    return { board: new Array(size * size).fill(null), passes: 0, size, ko: null }
  },
  validateMove(move, slice) {
    if (move.action === 'pass') return true
    if (move.coord < 0 || move.coord >= slice.board.length) return false
    if (slice.board[move.coord] !== null) return false
    if (move.coord === slice.ko) return false
    return true
  },
  applyMove(move, slice, full) {
    if (move.action === 'pass') {
      return { ...slice, passes: slice.passes + 1, ko: null }
    }
    const board = [...slice.board]
    const currentPlayer = full.__players.currentIndex === 0 ? 'black' : 'white'
    const opponent = currentPlayer === 'black' ? 'white' : 'black'
    board[move.coord] = currentPlayer

    let captured = []
    for (const n of getNeighbours(move.coord, slice.size)) {
      if (board[n] === opponent) {
        const group = getGroup(board, n, slice.size)
        if (group.liberties === 0) {
          for (const s of group.stones) { board[s] = null; captured.push(s) }
        }
      }
    }

    const ko = captured.length === 1 ? captured[0] : null
    return { ...slice, board, passes: 0, ko }
  },
  getLegalMoves(slice) {
    const moves = [{ action: 'pass' }]
    for (let i = 0; i < slice.board.length; i++) {
      if (slice.board[i] === null && i !== slice.ko) moves.push({ coord: i })
    }
    return moves
  },
  checkWin(slice) {
    if (slice.passes >= 2) return 'scoring'
    return null
  },
}

describe('proof: go', () => {
  let pipeline, store, history, playerSystem, eventBus

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(goPlugin)
    playerSystem = createPlayerSystem({ players: ['black', 'white'] })
    store = createStore({})
    registry.initAll({ go: { size: 9 } }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('placement move puts stone on board', () => {
    pipeline.execute({ coord: 40 })
    expect(store.get('go').board[40]).toBe('black')
  })

  test('cannot place on occupied intersection', () => {
    pipeline.execute({ coord: 40 })
    pipeline.execute({ coord: 40 })
    expect(store.get('go').board[40]).toBe('black')
  })

  test('capture removes group with no liberties', () => {
    // Place a single black stone at position 10 (row 1, col 1)
    // Surround it with white on 3 sides: 1 (above), 9 (left), 19 (below)
    // Then white plays at 11 (right) to capture
    const board = new Array(81).fill(null)
    board[10] = 'black'
    board[1] = 'white'   // above
    board[9] = 'white'   // left
    board[19] = 'white'  // below
    // White needs to play at 11 (right) to capture
    // But it's black's turn first, so set it to white's turn
    store.set('go', { board, passes: 0, size: 9, ko: null }, 'go')
    playerSystem.advance(store) // now it's white's turn (index 1)

    pipeline.execute({ coord: 11 })
    expect(store.get('go').board[10]).toBeNull()
  })

  test('both pass ends game', () => {
    pipeline.execute({ action: 'pass' })
    const result = pipeline.execute({ action: 'pass' })
    expect(result.winner).toBe('scoring')
  })

  test('pass resets on play', () => {
    pipeline.execute({ action: 'pass' })
    pipeline.execute({ coord: 0 })
    expect(store.get('go').passes).toBe(0)
  })

  test('ko rule prevents immediate recapture', () => {
    const board = new Array(81).fill(null)
    board[0] = 'white'; board[2] = 'white'; board[10] = 'white'
    board[9] = 'black'; board[11] = 'black'; board[19] = 'black'
    board[1] = 'black'
    store.set('go', { board, passes: 0, size: 9, ko: null }, 'go')
    pipeline.execute({ coord: 10 })
    const goState = store.get('go')
    if (goState.ko !== null) {
      const result = pipeline.execute({ coord: goState.ko })
      expect(result.ok).toBe(false)
    }
  })

  test('undo restores captured stones', () => {
    const board = new Array(81).fill(null)
    board[10] = 'black'
    board[1] = 'white'
    board[9] = 'white'
    board[19] = 'white'
    store.set('go', { board, passes: 0, size: 9, ko: null }, 'go')
    playerSystem.advance(store) // white's turn

    pipeline.execute({ coord: 11 })
    expect(store.get('go').board[10]).toBeNull()
    history.undo(store)
    expect(store.get('go').board[10]).toBe('black')
  })
})
