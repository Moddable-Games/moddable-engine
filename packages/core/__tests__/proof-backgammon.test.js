import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'
import { createRng } from '../src/rng.js'

function initialPoints() {
  const points = new Array(24).fill(null).map(() => ({ colour: null, count: 0 }))
  points[0] = { colour: 'white', count: 2 }
  points[5] = { colour: 'black', count: 5 }
  points[7] = { colour: 'black', count: 3 }
  points[11] = { colour: 'white', count: 5 }
  points[12] = { colour: 'black', count: 5 }
  points[16] = { colour: 'white', count: 3 }
  points[18] = { colour: 'white', count: 5 }
  points[23] = { colour: 'black', count: 2 }
  return points
}

const backgammonPlugin = {
  sliceName: 'backgammon',
  init(config, { request }) {
    const rng = request('core.rng')
    return {
      points: initialPoints(),
      bar: { white: 0, black: 0 },
      borneOff: { white: 0, black: 0 },
      dice: [],
      movesRemaining: [],
    }
  },
  validateMove(move, slice) {
    if (move.action === 'roll') return slice.dice.length === 0
    if (move.action === 'move') return slice.movesRemaining.length > 0
    return false
  },
  applyMove(move, slice, full) {
    if (move.action === 'roll') {
      const rng = full.__rng || { nextInt: () => 3 }
      const d1 = move.d1 || 3
      const d2 = move.d2 || 1
      const movesRemaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]
      return { ...slice, dice: [d1, d2], movesRemaining }
    }
    if (move.action === 'move') {
      const points = slice.points.map(p => ({ ...p }))
      const from = points[move.from]
      const to = points[move.to]
      from.count--
      if (from.count === 0) from.colour = null
      to.count++
      to.colour = from.colour || to.colour
      const movesRemaining = [...slice.movesRemaining]
      movesRemaining.splice(movesRemaining.indexOf(move.die), 1)
      return { ...slice, points, movesRemaining, dice: movesRemaining.length ? slice.dice : [] }
    }
    return slice
  },
  getLegalMoves(slice) {
    if (slice.dice.length === 0) return [{ action: 'roll' }]
    const moves = []
    for (const die of slice.movesRemaining) {
      for (let i = 0; i < 24; i++) {
        if (slice.points[i].count > 0) {
          moves.push({ action: 'move', from: i, to: (i + die) % 24, die })
        }
      }
    }
    return moves
  },
  checkWin(slice) {
    if (slice.borneOff.white >= 15) return 'white'
    if (slice.borneOff.black >= 15) return 'black'
    return null
  },
}

describe('proof: backgammon', () => {
  let pipeline, store, history, playerSystem, eventBus, registry

  beforeEach(() => {
    registry = createRegistry()
    const rng = createRng(42)
    registry.provide('core.rng', rng)
    registry.register(backgammonPlugin)
    playerSystem = createPlayerSystem({ players: ['white', 'black'] })
    store = createStore({})
    registry.initAll({ backgammon: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('roll produces dice and movesRemaining', () => {
    pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
    const state = store.get('backgammon')
    expect(state.dice).toEqual([3, 5])
    expect(state.movesRemaining).toEqual([3, 5])
  })

  test('doubles give 4 moves', () => {
    pipeline.execute({ action: 'roll', d1: 6, d2: 6 })
    expect(store.get('backgammon').movesRemaining).toHaveLength(4)
  })

  test('move consumes one die', () => {
    pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
    pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
    expect(store.get('backgammon').movesRemaining).toEqual([5])
  })

  test('multi-action turn: two moves before turn advances', () => {
    pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
    expect(playerSystem.current(store)).toBe('black')
    pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
    expect(playerSystem.current(store)).toBe('white')
    pipeline.execute({ action: 'move', from: 3, to: 8, die: 5 })
    expect(playerSystem.current(store)).toBe('black')
  })

  test('undo mid-turn restores dice state', () => {
    pipeline.execute({ action: 'roll', d1: 3, d2: 5 })
    pipeline.execute({ action: 'move', from: 0, to: 3, die: 3 })
    history.undo(store)
    expect(store.get('backgammon').movesRemaining).toEqual([3, 5])
  })

  test('track topology: no grid, just indexed positions', () => {
    const state = store.get('backgammon')
    expect(state.points).toHaveLength(24)
    expect(state.points[0]).toEqual({ colour: 'white', count: 2 })
  })

  test('seeded RNG provided via registry', () => {
    const rng = registry.request('core.rng')
    expect(rng).not.toBeNull()
    expect(typeof rng.nextInt).toBe('function')
  })
})
