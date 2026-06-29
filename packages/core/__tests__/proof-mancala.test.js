import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'

const mancalaPlugin = {
  sliceName: 'mancala',
  init(config) {
    const pits = config.pits || 6
    const seeds = config.seeds || 4
    return {
      pits: new Array(pits * 2).fill(seeds),
      stores: [0, 0],
      totalPits: pits,
    }
  },
  validateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const start = playerIdx * slice.totalPits
    const end = start + slice.totalPits
    if (move.pit < start || move.pit >= end) return false
    return slice.pits[move.pit] > 0
  },
  applyMove(move, slice, full) {
    const pits = [...slice.pits]
    const stores = [...slice.stores]
    const playerIdx = full.__players.currentIndex

    let seeds = pits[move.pit]
    pits[move.pit] = 0
    let pos = move.pit

    while (seeds > 0) {
      pos = (pos + 1) % pits.length
      pits[pos]++
      seeds--
    }

    // Capture: if last seed lands in empty pit on own side
    const ownStart = playerIdx * slice.totalPits
    const ownEnd = ownStart + slice.totalPits
    if (pos >= ownStart && pos < ownEnd && pits[pos] === 1) {
      const opposite = pits.length - 1 - pos
      if (pits[opposite] > 0) {
        stores[playerIdx] += pits[opposite] + 1
        pits[pos] = 0
        pits[opposite] = 0
      }
    }

    return { ...slice, pits, stores }
  },
  getLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const start = playerIdx * slice.totalPits
    const end = start + slice.totalPits
    const moves = []
    for (let i = start; i < end; i++) {
      if (slice.pits[i] > 0) moves.push({ pit: i })
    }
    return moves
  },
  checkWin(slice) {
    const half = slice.totalPits
    const side1 = slice.pits.slice(0, half).reduce((a, b) => a + b, 0)
    const side2 = slice.pits.slice(half).reduce((a, b) => a + b, 0)
    if (side1 === 0 || side2 === 0) {
      const total1 = slice.stores[0] + side1
      const total2 = slice.stores[1] + side2
      if (total1 > total2) return 'player1'
      if (total2 > total1) return 'player2'
      return 'draw'
    }
    return null
  },
}

describe('proof: mancala', () => {
  let pipeline, store, history, playerSystem, eventBus

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(mancalaPlugin)
    playerSystem = createPlayerSystem({ players: ['player1', 'player2'] })
    store = createStore({})
    registry.initAll({ mancala: { pits: 6, seeds: 4 } }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('initial state: 12 pits with 4 seeds each', () => {
    const state = store.get('mancala')
    expect(state.pits).toHaveLength(12)
    expect(state.pits.every(p => p === 4)).toBe(true)
    expect(state.stores).toEqual([0, 0])
  })

  test('sowing distributes seeds', () => {
    pipeline.execute({ pit: 0 })
    const state = store.get('mancala')
    expect(state.pits[0]).toBe(0)
    expect(state.pits[1]).toBe(5)
    expect(state.pits[2]).toBe(5)
    expect(state.pits[3]).toBe(5)
    expect(state.pits[4]).toBe(5)
  })

  test('cannot sow from empty pit', () => {
    store.set('mancala', { pits: [0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], stores: [0, 0], totalPits: 6 }, 'mancala')
    const result = pipeline.execute({ pit: 0 })
    expect(result.ok).toBe(false)
  })

  test('cannot sow from opponent side', () => {
    const result = pipeline.execute({ pit: 6 })
    expect(result.ok).toBe(false)
  })

  test('capture when last seed in empty own pit', () => {
    // Pit 2 has 1 seed, pit 3 is empty, pit 9 (opposite of 3, since 12-1-3=8...
    // opposite of pit i is (totalPits*2 - 1 - i) = 11 - i
    // Pit 2 has 1 seed -> lands in pit 3 (empty). Opposite = 11-3 = 8. Pit 8 has seeds.
    store.set('mancala', {
      pits: [0, 0, 1, 0, 0, 0, 4, 4, 6, 4, 4, 4],
      stores: [0, 0],
      totalPits: 6,
    }, 'mancala')
    pipeline.execute({ pit: 2 })
    const state = store.get('mancala')
    // Captured: 6 (from pit 8) + 1 (the landing seed) = 7
    expect(state.stores[0]).toBe(7)
  })

  test('game ends when one side is empty', () => {
    store.set('mancala', {
      pits: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      stores: [23, 24],
      totalPits: 6,
    }, 'mancala')
    const result = pipeline.execute({ pit: 5 })
    expect(result.winner).not.toBeNull()
  })

  test('undo restores sown seeds', () => {
    pipeline.execute({ pit: 0 })
    history.undo(store)
    expect(store.get('mancala').pits[0]).toBe(4)
  })

  test('move is single field { pit }', () => {
    const moves = pipeline.getLegalMoves()
    expect(moves.every(m => 'pit' in m)).toBe(true)
    expect(moves.every(m => Object.keys(m).length === 1)).toBe(true)
  })
})
