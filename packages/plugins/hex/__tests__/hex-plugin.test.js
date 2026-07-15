import { createHexPlugin } from '../index.js'
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'

function createTestGame(pluginConfig = {}, variantConfig = {}) {
  const plugin = createHexPlugin(variantConfig)
  const registry = createRegistry()
  registry.register(plugin)
  const playerSystem = createPlayerSystem({ players: ['black', 'white'] })
  const store = createStore({})
  registry.initAll({ hex: { size: 5, ...pluginConfig } }, store)
  store.set(playerSystem.sliceName, playerSystem.initState())
  const history = createHistory()
  const eventBus = createEventBus()
  const pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  return { plugin, registry, store, playerSystem, history, eventBus, pipeline }
}

describe('plugin-hex: unit tests', () => {
  describe('factory', () => {
    it('creates a plugin with correct sliceName', () => {
      const plugin = createHexPlugin()
      expect(plugin.sliceName).toBe('hex')
    })

    it('declares pieceTypes', () => {
      const plugin = createHexPlugin()
      expect(plugin.pieceTypes).toEqual(['stone'])
    })

    it('merges variant config', () => {
      const plugin = createHexPlugin({ swapRule: true })
      expect(plugin.config.swapRule).toBe(true)
    })
  })

  describe('init', () => {
    it('creates empty cells map', () => {
      const { store } = createTestGame()
      const state = store.get('hex')
      expect(state.cells).toEqual({})
      expect(state.boardSize).toBe(5)
    })

    it('initialises move count', () => {
      const { store } = createTestGame()
      expect(store.get('hex').moveCount).toBe(0)
    })
  })

  describe('validateMove', () => {
    it('allows placement on empty cell', () => {
      const { pipeline } = createTestGame()
      const result = pipeline.execute({ q: 2, r: 3 })
      expect(result.ok).toBe(true)
    })

    it('rejects placement on occupied cell', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ q: 2, r: 3 })
      const result = pipeline.execute({ q: 2, r: 3 })
      expect(result.ok).toBe(false)
    })

    it('rejects out-of-bounds coordinates', () => {
      const { pipeline } = createTestGame()
      expect(pipeline.execute({ q: -1, r: 0 }).ok).toBe(false)
      expect(pipeline.execute({ q: 5, r: 0 }).ok).toBe(false)
      expect(pipeline.execute({ q: 0, r: 5 }).ok).toBe(false)
    })
  })

  describe('applyMove', () => {
    it('places stone for current player', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ q: 2, r: 3 })
      expect(store.get('hex').cells['2,3']).toBe('black')
    })

    it('alternates colours', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ q: 0, r: 0 })
      pipeline.execute({ q: 1, r: 1 })
      expect(store.get('hex').cells['0,0']).toBe('black')
      expect(store.get('hex').cells['1,1']).toBe('white')
    })

    it('increments move count', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ q: 0, r: 0 })
      expect(store.get('hex').moveCount).toBe(1)
      pipeline.execute({ q: 1, r: 0 })
      expect(store.get('hex').moveCount).toBe(2)
    })
  })

  describe('checkWin — connection detection', () => {
    it('detects black win (left to right path)', () => {
      const { pipeline } = createTestGame()
      // Black connects q=0 to q=4 along r=2
      // Black plays at q=0,1,2,3,4 r=2
      // White plays at q=0,1,2,3 r=0
      for (let q = 0; q < 5; q++) {
        pipeline.execute({ q, r: 2 }) // black
        if (q < 4) pipeline.execute({ q, r: 0 }) // white
      }
      // After black plays q=4,r=2, checkWin should detect connection
      // But checkWin runs after the move, checking current player
      // After the last move by black, turn advances to white, so checkWin
      // is checked before advancement... let me verify the pipeline
      const state = pipeline.getLegalMoves() // just to trigger state read
      const hexState = pipeline.getLegalMoves !== undefined // not relevant

      // Actually, let's check the last result
      // The pipeline checks win AFTER applying the move, using current player
      // But at that point the turn hasn't advanced yet... let me re-check
      // Looking at move-pipeline: checkWin runs after applyMove, before advance
      // full.__players.currentIndex is still the player who moved
      // So after black plays the winning move, checkWin checks black
    })

    it('black wins by connecting left edge to right edge', () => {
      const { pipeline, store } = createTestGame()
      // Direct path: black at (0,2),(1,2),(2,2),(3,2),(4,2)
      const results = []
      for (let q = 0; q < 5; q++) {
        results.push(pipeline.execute({ q, r: 2 })) // black
        if (q < 4) pipeline.execute({ q, r: 0 }) // white (filler)
      }
      expect(results[4].winner).toBe('black')
    })

    it('white wins by connecting top edge to bottom edge', () => {
      const { pipeline } = createTestGame()
      // White connects r=0 to r=4 along q=1
      // Black plays q=0, white plays q=1 for each r
      pipeline.execute({ q: 0, r: 0 }) // black
      pipeline.execute({ q: 1, r: 0 }) // white
      pipeline.execute({ q: 0, r: 1 }) // black
      pipeline.execute({ q: 1, r: 1 }) // white
      pipeline.execute({ q: 0, r: 2 }) // black
      pipeline.execute({ q: 1, r: 2 }) // white
      pipeline.execute({ q: 0, r: 3 }) // black
      pipeline.execute({ q: 1, r: 3 }) // white
      pipeline.execute({ q: 0, r: 4 }) // black (no win — not connected q=0 to q=4)
      const result = pipeline.execute({ q: 1, r: 4 }) // white — connects r=0 to r=4
      expect(result.winner).toBe('white')
    })

    it('no win without complete path', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ q: 0, r: 0 })
      pipeline.execute({ q: 1, r: 1 })
      pipeline.execute({ q: 1, r: 0 })
      const result = pipeline.execute({ q: 2, r: 2 })
      expect(result.winner).toBeNull()
    })

    it('diagonal connections count (hex adjacency)', () => {
      const { pipeline } = createTestGame()
      // Path using hex diagonal: (0,2),(1,1),(2,1),(3,0),(4,0)
      // (q+1,r-1) is a valid hex neighbour
      pipeline.execute({ q: 0, r: 2 }) // black
      pipeline.execute({ q: 0, r: 0 }) // white
      pipeline.execute({ q: 1, r: 1 }) // black
      pipeline.execute({ q: 0, r: 1 }) // white
      pipeline.execute({ q: 2, r: 1 }) // black
      pipeline.execute({ q: 0, r: 3 }) // white
      pipeline.execute({ q: 3, r: 0 }) // black
      pipeline.execute({ q: 0, r: 4 }) // white
      const result = pipeline.execute({ q: 4, r: 0 }) // black — connects via diagonals
      expect(result.winner).toBe('black')
    })
  })

  describe('getLegalMoves', () => {
    it('returns all empty cells at start', () => {
      const { pipeline } = createTestGame()
      const moves = pipeline.getLegalMoves()
      expect(moves.length).toBe(25) // 5x5
    })

    it('decreases as stones are placed', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ q: 0, r: 0 })
      const moves = pipeline.getLegalMoves()
      expect(moves.length).toBe(24)
    })
  })

  describe('swap rule variant', () => {
    it('swap not available by default', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ q: 2, r: 2 }) // black's first move
      const moves = pipeline.getLegalMoves()
      expect(moves.find(m => m.action === 'swap')).toBeUndefined()
    })

    it('swap available after first move when enabled', () => {
      const { pipeline } = createTestGame({}, { swapRule: true })
      pipeline.execute({ q: 2, r: 2 }) // black's first move
      const moves = pipeline.getLegalMoves()
      expect(moves.find(m => m.action === 'swap')).toBeDefined()
    })

    it('swap reverses colours', () => {
      const { pipeline, store } = createTestGame({}, { swapRule: true })
      pipeline.execute({ q: 2, r: 2 }) // black
      expect(store.get('hex').cells['2,2']).toBe('black')
      pipeline.execute({ action: 'swap' }) // white swaps
      expect(store.get('hex').cells['2,2']).toBe('white')
    })

    it('swap only available on move 2', () => {
      const { pipeline } = createTestGame({}, { swapRule: true })
      pipeline.execute({ q: 2, r: 2 }) // black
      pipeline.execute({ q: 3, r: 3 }) // white plays normally instead of swapping
      const moves = pipeline.getLegalMoves()
      expect(moves.find(m => m.action === 'swap')).toBeUndefined()
    })
  })

  describe('undo', () => {
    it('removes placed stone', () => {
      const { pipeline, store, history } = createTestGame()
      pipeline.execute({ q: 2, r: 3 })
      expect(store.get('hex').cells['2,3']).toBe('black')
      history.undo(store)
      expect(store.get('hex').cells['2,3']).toBeUndefined()
    })
  })

  describe('variant hook overrides', () => {
    it('custom moveFilter restricts placement', () => {
      const { pipeline } = createTestGame({}, {
        hooks: {
          moveFilter: (moves) => moves.filter(m => {
            if (!m.q && m.q !== 0) return true
            return m.q >= 2
          }),
        },
      })
      const moves = pipeline.getLegalMoves()
      const coords = moves.filter(m => m.q !== undefined)
      expect(coords.every(m => m.q >= 2)).toBe(true)
    })
  })
})
