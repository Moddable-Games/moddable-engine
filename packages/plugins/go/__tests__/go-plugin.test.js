import { createGoPlugin } from '../index.js'
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'

function createTestGame(pluginConfig = {}, variantConfig = {}) {
  const plugin = createGoPlugin(variantConfig)
  const registry = createRegistry()
  registry.register(plugin)
  const playerSystem = createPlayerSystem({ players: ['black', 'white'] })
  const store = createStore({})
  registry.initAll({ go: { size: 9, ...pluginConfig } }, store)
  store.set(playerSystem.sliceName, playerSystem.initState())
  const history = createHistory()
  const eventBus = createEventBus()
  const pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  return { plugin, registry, store, playerSystem, history, eventBus, pipeline }
}

describe('plugin-go: unit tests', () => {
  describe('factory', () => {
    it('creates a plugin with correct sliceName', () => {
      const plugin = createGoPlugin()
      expect(plugin.sliceName).toBe('go')
    })

    it('declares pieceTypes', () => {
      const plugin = createGoPlugin()
      expect(plugin.pieceTypes).toEqual(['stone'])
    })

    it('merges variant config with defaults', () => {
      const plugin = createGoPlugin({ komi: 7.5, scoring: 'area' })
      expect(plugin.config.komi).toBe(7.5)
      expect(plugin.config.scoring).toBe('area')
      expect(plugin.config.suicideAllowed).toBe(false)
    })
  })

  describe('init', () => {
    it('creates initial state with correct board size', () => {
      const { store } = createTestGame({ size: 9 })
      const state = store.get('go')
      expect(state.board.length).toBe(81)
      expect(state.board.every(c => c === null)).toBe(true)
    })

    it('initialises passes, ko, and captures', () => {
      const { store } = createTestGame()
      const state = store.get('go')
      expect(state.passes).toBe(0)
      expect(state.ko).toBeNull()
      expect(state.captures).toEqual({ 0: 0, 1: 0 })
    })

    it('stores komi from config', () => {
      const { store } = createTestGame({}, { komi: 7.5 })
      const state = store.get('go')
      expect(state.komi).toBe(7.5)
    })
  })

  describe('validateMove', () => {
    it('allows pass', () => {
      const { pipeline } = createTestGame()
      const result = pipeline.execute({ action: 'pass' })
      expect(result.ok).toBe(true)
    })

    it('allows placement on empty intersection', () => {
      const { pipeline } = createTestGame()
      const result = pipeline.execute({ coord: 40 })
      expect(result.ok).toBe(true)
    })

    it('rejects placement on occupied intersection', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ coord: 40 })
      const result = pipeline.execute({ coord: 40 })
      expect(result.ok).toBe(false)
    })

    it('rejects out-of-bounds coordinate', () => {
      const { pipeline } = createTestGame()
      expect(pipeline.execute({ coord: -1 }).ok).toBe(false)
      expect(pipeline.execute({ coord: 81 }).ok).toBe(false)
    })

    it('rejects ko violation', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      // Set up a ko situation manually
      const board = new Array(81).fill(null)
      // Classic ko: white just captured at position 10
      board[1] = 'white'; board[9] = 'white'; board[19] = 'white'; board[11] = 'white'
      store.set('go', {
        board, passes: 0, ko: 10, captures: { 0: 0, 1: 1 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')

      // Black tries to recapture at ko point
      const result = pipeline.execute({ coord: 10 })
      expect(result.ok).toBe(false)
    })
  })

  describe('applyMove — placement', () => {
    it('places stone on board for current player', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ coord: 40 })
      expect(store.get('go').board[40]).toBe('black')
    })

    it('alternates colours between players', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ coord: 40 })
      pipeline.execute({ coord: 41 })
      expect(store.get('go').board[40]).toBe('black')
      expect(store.get('go').board[41]).toBe('white')
    })

    it('resets passes on placement', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ action: 'pass' })
      expect(store.get('go').passes).toBe(1)
      pipeline.execute({ coord: 0 })
      expect(store.get('go').passes).toBe(0)
    })
  })

  describe('applyMove — capture', () => {
    it('captures a single stone when surrounded', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      const board = new Array(81).fill(null)
      board[10] = 'black'
      board[1] = 'white'
      board[9] = 'white'
      board[19] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      playerSystem.advance(store) // white's turn

      pipeline.execute({ coord: 11 }) // completes the surround
      expect(store.get('go').board[10]).toBeNull()
      expect(store.get('go').captures[1]).toBe(1)
    })

    it('captures a group when all liberties filled', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      // Black group at 0,1. White at 9,2. Last liberty is 10 (below 1).
      const board = new Array(81).fill(null)
      board[0] = 'black'; board[1] = 'black'
      board[9] = 'white'; board[2] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      playerSystem.advance(store) // white's turn

      pipeline.execute({ coord: 10 }) // white takes last liberty of group {0,1}
      expect(store.get('go').board[0]).toBeNull()
      expect(store.get('go').board[1]).toBeNull()
      expect(store.get('go').captures[1]).toBe(2)
    })

    it('sets ko point on single-stone capture', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      const board = new Array(81).fill(null)
      board[10] = 'black'
      board[1] = 'white'; board[9] = 'white'; board[19] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      playerSystem.advance(store)

      pipeline.execute({ coord: 11 })
      expect(store.get('go').ko).toBe(10)
    })

    it('does not set ko on multi-stone capture', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      const board = new Array(81).fill(null)
      board[0] = 'black'; board[1] = 'black'
      board[9] = 'white'; board[2] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      playerSystem.advance(store)

      pipeline.execute({ coord: 10 })
      expect(store.get('go').ko).toBeNull()
    })
  })

  describe('applyMove — pass', () => {
    it('increments pass count', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ action: 'pass' })
      expect(store.get('go').passes).toBe(1)
    })

    it('clears ko on pass', () => {
      const { pipeline, store } = createTestGame()
      store.set('go', {
        ...store.get('go'), ko: 10,
      }, 'go')
      pipeline.execute({ action: 'pass' })
      expect(store.get('go').ko).toBeNull()
    })
  })

  describe('checkWin', () => {
    it('returns scoring after two consecutive passes', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ action: 'pass' })
      const result = pipeline.execute({ action: 'pass' })
      expect(result.winner).toBe('scoring')
    })

    it('returns null during normal play', () => {
      const { pipeline } = createTestGame()
      const result = pipeline.execute({ coord: 40 })
      expect(result.winner).toBeNull()
    })
  })

  describe('getLegalMoves', () => {
    it('includes pass on empty board', () => {
      const { pipeline } = createTestGame()
      const moves = pipeline.getLegalMoves()
      expect(moves).toContainEqual({ action: 'pass' })
    })

    it('includes all empty intersections', () => {
      const { pipeline } = createTestGame()
      const moves = pipeline.getLegalMoves()
      // 81 empty cells + 1 pass
      expect(moves.length).toBe(82)
    })

    it('excludes occupied intersections', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ coord: 40 })
      const moves = pipeline.getLegalMoves()
      expect(moves).not.toContainEqual({ coord: 40 })
    })

    it('excludes ko point', () => {
      const { pipeline, store } = createTestGame()
      store.set('go', { ...store.get('go'), ko: 20 }, 'go')
      const moves = pipeline.getLegalMoves()
      expect(moves).not.toContainEqual({ coord: 20 })
    })
  })

  describe('suicide prevention', () => {
    it('rejects suicide move by default', () => {
      const { pipeline, store } = createTestGame()
      // Corner cell 0 surrounded on all sides
      const board = new Array(81).fill(null)
      board[1] = 'white'; board[9] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')

      const result = pipeline.execute({ coord: 0 })
      expect(result.ok).toBe(false)
    })

    it('allows suicide when config permits', () => {
      const { pipeline, store } = createTestGame({}, { suicideAllowed: true })
      const board = new Array(81).fill(null)
      board[1] = 'white'; board[9] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')

      const result = pipeline.execute({ coord: 0 })
      expect(result.ok).toBe(true)
    })

    it('allows placement that captures (not suicide)', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      // Black stone at 0. White at 1,9. Black plays at... wait.
      // Setup: white stone at 1 with no liberties except 0
      // White at 1, black at 2,10. Black plays 0 — captures white at 1.
      const board = new Array(81).fill(null)
      board[1] = 'white'
      board[2] = 'black'; board[10] = 'black'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      // Black's turn — plays at 0
      // 0's neighbours: 1(white),9(empty). So 0 has liberty at 9 — not suicide anyway
      // Better test: black plays into spot that would be suicide but captures first
      // Position where playing captures, removing surround
      const board2 = new Array(81).fill(null)
      board2[10] = 'white'
      board2[0] = 'black'; board2[2] = 'black'; board2[19] = 'black'
      // white at 10 has liberties: 1(empty), 9(empty), 11(empty)
      // No — we need white surrounded. Let me think more carefully.
      // 9x9 board. White at 10. Neighbours of 10: 1,9,11,19
      // Black at 1,9,19. White has only liberty at 11.
      board2[1] = 'black'; board2[9] = 'black'; board2[19] = 'black'
      store.set('go', {
        board: board2, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      // Black plays at 11 — this takes white's last liberty, not suicide
      const result = pipeline.execute({ coord: 11 })
      expect(result.ok).toBe(true)
      expect(store.get('go').board[10]).toBeNull()
    })
  })

  describe('variant config — hook overrides', () => {
    it('custom moveFilter restricts moves', () => {
      const plugin = createGoPlugin({
        hooks: {
          moveFilter: (moves) => moves.filter(m => m.action === 'pass' || m.coord < 40),
        },
      })
      const registry = createRegistry()
      registry.register(plugin)
      const playerSystem = createPlayerSystem({ players: ['black', 'white'] })
      const store = createStore({})
      registry.initAll({ go: { size: 9 } }, store)
      store.set(playerSystem.sliceName, playerSystem.initState())
      const history = createHistory()
      const eventBus = createEventBus()
      const pipeline = createPipeline(registry, store, history, playerSystem, eventBus)

      const moves = pipeline.getLegalMoves()
      const coords = moves.filter(m => m.coord !== undefined).map(m => m.coord)
      expect(coords.every(c => c < 40)).toBe(true)
    })
  })

  describe('undo', () => {
    it('undoes a placement', () => {
      const { pipeline, store, history } = createTestGame()
      pipeline.execute({ coord: 40 })
      expect(store.get('go').board[40]).toBe('black')
      history.undo(store)
      expect(store.get('go').board[40]).toBeNull()
    })

    it('undoes a capture — restores captured stones', () => {
      const { pipeline, store, playerSystem, history } = createTestGame()
      const board = new Array(81).fill(null)
      board[10] = 'black'
      board[1] = 'white'; board[9] = 'white'; board[19] = 'white'
      store.set('go', {
        board, passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
      }, 'go')
      playerSystem.advance(store)

      pipeline.execute({ coord: 11 })
      expect(store.get('go').board[10]).toBeNull()
      history.undo(store)
      expect(store.get('go').board[10]).toBe('black')
    })
  })
})
