import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'

const INITIAL_BOARD = [
  'r','n','b','q','k','b','n','r',
  'p','p','p','p','p','p','p','p',
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  null,null,null,null,null,null,null,null,
  'P','P','P','P','P','P','P','P',
  'R','N','B','Q','K','B','N','R',
]

const chessPlugin = {
  sliceName: 'chess',
  init(config) {
    return { board: [...INITIAL_BOARD], captured: [] }
  },
  validateMove(move, slice) {
    if (move.from < 0 || move.from > 63 || move.to < 0 || move.to > 63) return false
    return slice.board[move.from] !== null
  },
  applyMove(move, slice) {
    const board = [...slice.board]
    const captured = [...slice.captured]
    if (board[move.to] !== null) captured.push(board[move.to])
    board[move.to] = board[move.from]
    board[move.from] = null
    return { board, captured }
  },
  getLegalMoves(slice) {
    const moves = []
    for (let i = 0; i < 64; i++) {
      if (slice.board[i] !== null) {
        moves.push({ from: i, to: (i + 8) % 64 })
      }
    }
    return moves
  },
  checkWin(slice) {
    const hasWhiteKing = slice.board.includes('K')
    const hasBlackKing = slice.board.includes('k')
    if (!hasWhiteKing) return 'black'
    if (!hasBlackKing) return 'white'
    return null
  },
}

describe('proof: chess', () => {
  let pipeline, store, history, playerSystem, eventBus

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(chessPlugin)
    playerSystem = createPlayerSystem({ players: ['white', 'black'] })
    store = createStore({})
    registry.initAll({ chess: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('initial state has 64 squares', () => {
    expect(store.get('chess').board).toHaveLength(64)
  })

  test('move updates board', () => {
    const result = pipeline.execute({ from: 48, to: 40 })
    expect(result.ok).toBe(true)
    expect(store.get('chess').board[40]).toBe('P')
    expect(store.get('chess').board[48]).toBeNull()
  })

  test('turns alternate', () => {
    expect(playerSystem.current(store)).toBe('white')
    pipeline.execute({ from: 48, to: 40 })
    expect(playerSystem.current(store)).toBe('black')
    pipeline.execute({ from: 8, to: 16 })
    expect(playerSystem.current(store)).toBe('white')
  })

  test('capture records captured piece', () => {
    store.set('chess', {
      board: (() => {
        const b = new Array(64).fill(null)
        b[0] = 'K'; b[63] = 'k'; b[20] = 'P'; b[21] = 'p'
        return b
      })(),
      captured: [],
    }, 'chess')
    pipeline.execute({ from: 20, to: 21 })
    expect(store.get('chess').captured).toContain('p')
  })

  test('king capture triggers win', () => {
    store.set('chess', {
      board: (() => {
        const b = new Array(64).fill(null)
        b[0] = 'K'; b[1] = 'Q'; b[2] = 'k'
        return b
      })(),
      captured: [],
    }, 'chess')
    const result = pipeline.execute({ from: 1, to: 2 })
    expect(result.winner).toBe('white')
  })

  test('undo restores captured piece', () => {
    store.set('chess', {
      board: (() => {
        const b = new Array(64).fill(null)
        b[0] = 'K'; b[63] = 'k'; b[20] = 'P'; b[21] = 'p'
        return b
      })(),
      captured: [],
    }, 'chess')
    pipeline.execute({ from: 20, to: 21 })
    history.undo(store)
    expect(store.get('chess').board[21]).toBe('p')
    expect(store.get('chess').captured).toEqual([])
  })

  test('history records moves', () => {
    pipeline.execute({ from: 48, to: 40 })
    pipeline.execute({ from: 8, to: 16 })
    expect(history.length()).toBe(2)
  })

  test('4-player variant turn rotation', () => {
    const registry = createRegistry()
    registry.register(chessPlugin)
    const ps4 = createPlayerSystem({ players: ['white', 'black', 'red', 'blue'] })
    const s4 = createStore({})
    registry.initAll({ chess: {} }, s4)
    s4.set(ps4.sliceName, ps4.initState())
    const h4 = createHistory()
    const eb4 = createEventBus()
    const p4 = createPipeline(registry, s4, h4, ps4, eb4)

    expect(ps4.current(s4)).toBe('white')
    p4.execute({ from: 48, to: 40 })
    expect(ps4.current(s4)).toBe('black')
    p4.execute({ from: 8, to: 16 })
    expect(ps4.current(s4)).toBe('red')
    p4.execute({ from: 49, to: 41 })
    expect(ps4.current(s4)).toBe('blue')
    p4.execute({ from: 9, to: 17 })
    expect(ps4.current(s4)).toBe('white')
  })
})
