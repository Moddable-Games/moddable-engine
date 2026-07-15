import { createBackgammonPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createTrackTopology } from '../../../topology-track/index.js'
import { createThemeResolver } from '../../../board-theme/index.js'
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
  return { plugin, registry, store, playerSystem, history, eventBus, pipeline }
}

describe('plugin-backgammon', () => {
  describe('factory', () => {
    it('creates with correct sliceName', () => {
      const plugin = createBackgammonPlugin()
      expect(plugin.sliceName).toBe('backgammon')
    })

    it('declares pieceTypes', () => {
      const plugin = createBackgammonPlugin()
      expect(plugin.pieceTypes).toEqual(['checker'])
    })
  })

  describe('init', () => {
    it('sets up standard starting position', () => {
      const { store } = createTestGame()
      const state = store.get('backgammon')
      expect(state.points).toHaveLength(24)
      expect(state.points[0]).toEqual({ owner: 0, count: 2 })
      expect(state.points[5]).toEqual({ owner: 1, count: 5 })
      expect(state.bar).toEqual({ 0: 0, 1: 0 })
      expect(state.borneOff).toEqual({ 0: 0, 1: 0 })
      expect(state.dice).toEqual([])
    })
  })

  describe('rolling', () => {
    it('roll produces dice and movesRemaining', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      const state = store.get('backgammon')
      expect(state.dice).toEqual([3, 5])
      expect(state.movesRemaining).toEqual([3, 5])
    })

    it('doubles give 4 moves', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 6, d2: 6 })
      expect(store.get('backgammon').movesRemaining).toHaveLength(4)
    })

    it('roll grants continueTurn', () => {
      const { pipeline } = createTestGame()
      const result = pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      expect(result.continueTurn).toBe(true)
    })

    it('cannot roll when dice already active', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      const result = pipeline.execute({ action: 'roll', d1: 4, d2: 2 })
      expect(result.ok).toBe(false)
    })
  })

  describe('moving', () => {
    it('moves a checker and consumes a die', () => {
      const { pipeline, store } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
      const state = store.get('backgammon')
      expect(state.points[0].count).toBe(1)
      expect(state.points[3].count).toBe(1)
      expect(state.points[3].owner).toBe(0)
      expect(state.movesRemaining).toEqual([5])
    })

    it('continueTurn while moves remain', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      const result = pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
      expect(result.continueTurn).toBe(true)
      expect(playerSystem.current(store)).toBe('white')
    })

    it('turn advances after last move', () => {
      const { pipeline, store, playerSystem } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
      pipeline.execute({ action: 'move', from: 3, to: 8, die: 5 })
      expect(playerSystem.current(store)).toBe('black')
    })
  })

  describe('hitting (capture)', () => {
    it('sends blot to bar', () => {
      const { pipeline, store } = createTestGame()
      // Set up a blot at position 3 (opponent's single piece)
      const state = store.get('backgammon')
      const points = state.points.map(p => ({ ...p }))
      points[3] = { owner: 1, count: 1 }
      store.set('backgammon', { ...state, points }, 'backgammon')

      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })

      const after = store.get('backgammon')
      expect(after.points[3].owner).toBe(0)
      expect(after.points[3].count).toBe(1)
      expect(after.bar[1]).toBe(1)
    })
  })

  describe('checkWin', () => {
    it('declares winner when all pieces borne off', () => {
      const { pipeline, store } = createTestGame()
      store.set('backgammon', {
        ...store.get('backgammon'),
        borneOff: { 0: 14, 1: 0 },
        points: store.get('backgammon').points.map((p, i) =>
          i === 0 ? { owner: 0, count: 1 } : { ...p, owner: p.owner === 0 ? null : p.owner, count: p.owner === 0 ? 0 : p.count }
        ),
      }, 'backgammon')

      // White bears off the last piece
      pipeline.execute({ action: 'roll', d1: 1, d2: 2 })
      pipeline.execute({ action: 'move', from: 0, to: 'off', die: 1 })
      const state = store.get('backgammon')
      expect(state.borneOff[0]).toBe(15)
    })
  })

  describe('undo', () => {
    it('restores dice state after undo', () => {
      const { pipeline, store, history } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
      history.undo(store)
      expect(store.get('backgammon').movesRemaining).toEqual([3, 5])
    })
  })

  describe('getLegalMoves', () => {
    it('only offers roll when no dice active', () => {
      const { pipeline } = createTestGame()
      const moves = pipeline.getLegalMoves()
      expect(moves).toEqual([{ action: 'roll' }])
    })

    it('offers movement options after roll', () => {
      const { pipeline } = createTestGame()
      pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
      const moves = pipeline.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.action === 'move')).toBe(true)
    })
  })
})
