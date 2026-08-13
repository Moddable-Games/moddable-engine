import { createHexTopology } from '../src/topology-hex.js'
import { createRegistry } from '../../../core/src/plugin-registry.js'
import { createStore } from '../../../core/src/state-store.js'
import { createHistory } from '../../../core/src/history.js'
import { createPlayerSystem } from '../../../core/src/player-system.js'
import { createEventBus } from '../../../core/src/event-bus.js'
import { createPipeline } from '../../../core/src/move-pipeline.js'

const topology = createHexTopology({ radius: 4 })

function hasPath(cells, player, topo) {
  const owned = Object.entries(cells).filter(([, v]) => v === player).map(([k]) => k)
  if (owned.length === 0) return false

  const isStartEdge = player === 'black'
    ? (k) => topo.fromJSON(k).q === -4
    : (k) => topo.fromJSON(k).r === -4
  const isEndEdge = player === 'black'
    ? (k) => topo.fromJSON(k).q === 4
    : (k) => topo.fromJSON(k).r === 4

  const starts = owned.filter(isStartEdge)
  const visited = new Set()
  const stack = [...starts]

  while (stack.length) {
    const k = stack.pop()
    if (visited.has(k)) continue
    visited.add(k)
    if (isEndEdge(k)) return true
    for (const n of topo.neighbours(k)) {
      if (cells[n] === player && !visited.has(n)) stack.push(n)
    }
  }
  return false
}

const hexConnectionPlugin = {
  sliceName: 'hex',
  init() {
    return { cells: {} }
  },
  validateMove(move, slice) {
    return slice.cells[move.cell] === undefined && topology.isValid(move.cell)
  },
  applyMove(move, slice, full) {
    const player = full.__players.currentIndex === 0 ? 'black' : 'white'
    return { cells: { ...slice.cells, [move.cell]: player } }
  },
  getLegalMoves(slice) {
    return topology.getAllCells()
      .filter(k => slice.cells[k] === undefined)
      .map(k => ({ cell: k }))
  },
  checkWin(slice, full) {
    const player = full.__players.currentIndex === 0 ? 'black' : 'white'
    if (hasPath(slice.cells, player, topology)) return player
    return null
  },
}

describe('proof: hex-connection (topology-hex + core)', () => {
  let pipeline, store, history, playerSystem

  beforeEach(() => {
    const registry = createRegistry()
    registry.register(hexConnectionPlugin)
    playerSystem = createPlayerSystem({ players: ['black', 'white'] })
    store = createStore({})
    registry.initAll({ hex: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    pipeline = createPipeline(registry, store, history, playerSystem, createEventBus())
  })

  test('placement on hex cell', () => {
    pipeline.execute({ cell: '0,0' })
    expect(store.get('hex').cells['0,0']).toBe('black')
  })

  test('cannot place on occupied cell', () => {
    pipeline.execute({ cell: '0,0' })
    const result = pipeline.execute({ cell: '0,0' })
    expect(result.ok).toBe(false)
  })

  test('topology.neighbours drives adjacency', () => {
    const ns = topology.neighbours({ q: 0, r: 0 })
    expect(ns).toHaveLength(6)
    pipeline.execute({ cell: '0,0' })
    pipeline.execute({ cell: ns[0] })
    expect(store.get('hex').cells[ns[0]]).toBe('white')
  })

  test('connection win via topology path traversal', () => {
    // Black builds a path from q=-4 to q=4 along r=0
    const path = []
    for (let q = -4; q <= 4; q++) {
      if (topology.isValid({ q, r: 0 })) path.push(`${q},0`)
    }

    let moveIdx = 0
    for (const cell of path) {
      pipeline.execute({ cell })
      if (moveIdx < path.length - 1) {
        // White plays somewhere else
        const whiteCell = topology.getAllCells().find(k =>
          store.get('hex').cells[k] === undefined && !path.includes(k)
        )
        if (whiteCell) pipeline.execute({ cell: whiteCell })
      }
      moveIdx++
    }

    expect(hasPath(store.get('hex').cells, 'black', topology)).toBe(true)
  })

  test('no win without complete path', () => {
    pipeline.execute({ cell: '-4,0' })
    pipeline.execute({ cell: '0,-4' })
    pipeline.execute({ cell: '-3,0' })
    expect(hasPath(store.get('hex').cells, 'black', topology)).toBe(false)
  })

  test('sparse state: only placed cells stored', () => {
    pipeline.execute({ cell: '2,-1' })
    pipeline.execute({ cell: '-1,2' })
    expect(Object.keys(store.get('hex').cells)).toHaveLength(2)
  })

  test('undo removes placed stone', () => {
    pipeline.execute({ cell: '1,1' })
    history.undo(store)
    expect(store.get('hex').cells['1,1']).toBeUndefined()
  })

  test('hex radius 4 has 61 cells total', () => {
    expect(topology.getCellCount()).toBe(61)
  })

  test('legal moves decrease as cells fill', () => {
    const before = pipeline.getLegalMoves().length
    pipeline.execute({ cell: '0,0' })
    pipeline.execute({ cell: '1,0' })
    const after = pipeline.getLegalMoves().length
    expect(after).toBe(before - 2)
  })
})
