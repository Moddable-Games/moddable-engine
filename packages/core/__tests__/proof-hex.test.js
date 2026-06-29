import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'

function hexNeighbours(q, r) {
  return [
    [q+1, r], [q-1, r], [q, r+1], [q, r-1], [q+1, r-1], [q-1, r+1]
  ]
}

function hasPath(cells, player, size) {
  const owned = Object.entries(cells).filter(([, v]) => v === player)
  if (owned.length === 0) return false

  const visited = new Set()
  const isStartEdge = player === 'black' ? ([q]) => q === 0 : ([, r]) => r === 0
  const isEndEdge = player === 'black' ? ([q]) => q === size - 1 : ([, r]) => r === size - 1

  const starts = owned.filter(([key]) => {
    const [q, r] = key.split(',').map(Number)
    return isStartEdge([q, r])
  })

  const stack = starts.map(([key]) => key)
  while (stack.length) {
    const key = stack.pop()
    if (visited.has(key)) continue
    visited.add(key)
    const [q, r] = key.split(',').map(Number)
    if (isEndEdge([q, r])) return true
    for (const [nq, nr] of hexNeighbours(q, r)) {
      const nkey = `${nq},${nr}`
      if (cells[nkey] === player && !visited.has(nkey)) stack.push(nkey)
    }
  }
  return false
}

const hexPlugin = {
  sliceName: 'hex',
  init(config) {
    return { cells: {}, size: config.size || 11 }
  },
  validateMove(move, slice) {
    const key = `${move.q},${move.r}`
    if (move.q < 0 || move.q >= slice.size || move.r < 0 || move.r >= slice.size) return false
    return slice.cells[key] === undefined
  },
  applyMove(move, slice, full) {
    const key = `${move.q},${move.r}`
    const player = full.__players.currentIndex === 0 ? 'black' : 'white'
    return { ...slice, cells: { ...slice.cells, [key]: player } }
  },
  getLegalMoves(slice) {
    const moves = []
    for (let q = 0; q < slice.size; q++) {
      for (let r = 0; r < slice.size; r++) {
        if (slice.cells[`${q},${r}`] === undefined) moves.push({ q, r })
      }
    }
    return moves
  },
  checkWin(slice, full) {
    const player = full.__players.currentIndex === 0 ? 'black' : 'white'
    if (hasPath(slice.cells, player, slice.size)) return player
    return null
  },
}

describe('proof: hex', () => {
  let pipeline, store, history, playerSystem, eventBus

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(hexPlugin)
    playerSystem = createPlayerSystem({ players: ['black', 'white'] })
    store = createStore({})
    registry.initAll({ hex: { size: 5 } }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('placement puts stone with hex coords', () => {
    pipeline.execute({ q: 2, r: 3 })
    expect(store.get('hex').cells['2,3']).toBe('black')
  })

  test('cannot place on occupied cell', () => {
    pipeline.execute({ q: 2, r: 3 })
    const result = pipeline.execute({ q: 2, r: 3 })
    expect(result.ok).toBe(false)
  })

  test('connection win detected (black left-to-right)', () => {
    for (let q = 0; q < 5; q++) {
      pipeline.execute({ q, r: 2 })
      if (q < 4) pipeline.execute({ q, r: 0 })
    }
    const lastMove = history.getCurrent()
    expect(lastMove).not.toBeNull()
    const state = store.get('hex')
    expect(hasPath(state.cells, 'black', 5)).toBe(true)
  })

  test('no win without complete path', () => {
    pipeline.execute({ q: 0, r: 0 })
    pipeline.execute({ q: 0, r: 1 })
    pipeline.execute({ q: 1, r: 0 })
    expect(store.get('hex').cells['0,0']).toBe('black')
    const state = store.get('hex')
    expect(hasPath(state.cells, 'black', 5)).toBe(false)
  })

  test('sparse state: only occupied cells stored', () => {
    pipeline.execute({ q: 3, r: 3 })
    const cells = store.get('hex').cells
    expect(Object.keys(cells)).toHaveLength(1)
  })

  test('coordinates serialise as strings', () => {
    pipeline.execute({ q: 4, r: 2 })
    const json = JSON.stringify(store.get('hex'))
    expect(json).toContain('4,2')
    const parsed = JSON.parse(json)
    expect(parsed.cells['4,2']).toBe('black')
  })

  test('undo removes placed stone', () => {
    pipeline.execute({ q: 1, r: 1 })
    history.undo(store)
    expect(store.get('hex').cells['1,1']).toBeUndefined()
  })

  test('hex neighbours have 6 directions', () => {
    const n = hexNeighbours(3, 3)
    expect(n).toHaveLength(6)
  })
})
