import { createBackgammonPlugin } from '../index.js'
import { createStandardDice } from '../../../component-dice/index.js'
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'
import { createRng } from '../../../core/src/rng.js'

function createTestGame(variantConfig = {}) {
  const plugin = createBackgammonPlugin(variantConfig)
  const registry = createRegistry()
  const rng = createRng(42)
  const dice = createStandardDice()
  registry.provide('core.rng', rng)
  registry.provide('component.dice', dice)
  registry.register(plugin)
  const playerSystem = createPlayerSystem({ players: ['white', 'black'] })
  const store = createStore({})
  registry.initAll({ backgammon: {} }, store)
  store.set(playerSystem.sliceName, playerSystem.initState())
  const history = createHistory()
  const eventBus = createEventBus()
  const pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  return { plugin, store, playerSystem, history, eventBus, pipeline }
}

describe('proof: Backgammon complete games', () => {
  describe('standard: multi-action turn sequence', () => {
    it('roll → move → move completes a turn', () => {
      const { pipeline, store, playerSystem } = createTestGame()

      expect(playerSystem.current(store)).toBe('white')
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      expect(playerSystem.current(store)).toBe('white') // still white (continueTurn)

      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
      expect(playerSystem.current(store)).toBe('white') // still white (1 die left)

      pipeline.execute({ action: 'move', from: 3, to: 8, die: 5 })
      expect(playerSystem.current(store)).toBe('black') // turn done
    })

    it('doubles: 4 moves in one turn', () => {
      const { pipeline, store, playerSystem } = createTestGame()

      pipeline.execute({ action: 'roll', d1: 1, d2: 1 })
      expect(store.get('backgammon').movesRemaining).toHaveLength(4)

      pipeline.execute({ action: 'move', from: 0, to: 1, die: 1 })
      pipeline.execute({ action: 'move', from: 1, to: 2, die: 1 })
      pipeline.execute({ action: 'move', from: 2, to: 3, die: 1 })
      expect(playerSystem.current(store)).toBe('white') // 1 die left

      pipeline.execute({ action: 'move', from: 3, to: 4, die: 1 })
      expect(playerSystem.current(store)).toBe('black') // all 4 used
    })
  })

  describe('hitting and bar mechanics', () => {
    it('hitting sends opponent to bar', () => {
      const { pipeline, store } = createTestGame()
      const state = store.get('backgammon')
      const points = state.points.map(p => ({ ...p }))
      points[3] = { owner: 1, count: 1 } // black blot at 3
      store.set('backgammon', { ...state, points }, 'backgammon')

      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })

      const after = store.get('backgammon')
      expect(after.bar[1]).toBe(1)
      expect(after.points[3].owner).toBe(0)
    })
  })

  describe('bearing off to win', () => {
    it('bears off all 15 to win', () => {
      const { pipeline, store } = createTestGame()
      // Set up near-win: 14 already off, 1 piece left at position 0
      const points = new Array(24).fill(null).map(() => ({ owner: null, count: 0 }))
      points[0] = { owner: 0, count: 1 }
      store.set('backgammon', {
        ...store.get('backgammon'),
        points,
        borneOff: { 0: 14, 1: 0 },
        bar: { 0: 0, 1: 0 },
      }, 'backgammon')

      pipeline.execute({ action: 'roll', d1: 1, d2: 2 })
      const result = pipeline.execute({ action: 'move', from: 0, to: 'off', die: 1 })

      expect(store.get('backgammon').borneOff[0]).toBe(15)
      expect(result.winner).toBe('player1')
    })
  })

  describe('variant: Nackgammon (more pieces per point)', () => {
    it('custom config accepted', () => {
      const plugin = createBackgammonPlugin({ positions: 24, bearOffThreshold: 15 })
      expect(plugin.config.positions).toBe(24)
      expect(plugin.config.bearOffThreshold).toBe(15)
    })
  })
})
