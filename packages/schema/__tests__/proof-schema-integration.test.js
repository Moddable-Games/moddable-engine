import { parseGameDefinition } from '../src/schema.js'
import { createGridTopology } from '../../topologies/grid/src/topology-grid.js'
import { createHexTopology } from '../../topologies/hex/src/topology-hex.js'
import { createTrackTopology } from '../../topologies/track/src/topology-track.js'
import { createPitTopology } from '../../topologies/pit/src/topology-pit.js'
import { createPieceRegistry } from '../../piece-behaviour/src/piece-registry.js'
import { createRegistry } from '../../core/src/plugin-registry.js'
import { createStore } from '../../core/src/state-store.js'
import { createPlayerSystem } from '../../core/src/player-system.js'

const CHESS_DEF = `---
title: "Standard Chess"
slug: "standard"
parent: "moddable-chess"
players: "2"
board: "8×8"
win: "Checkmate"
special: "Standard FIDE rules"
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  players: [white, black]
  pieces:
    - name: rook
      movement:
        type: slide
        directions: orthogonal
      symbol: R
      value: 5
    - name: knight
      movement:
        type: leap
        offsets: [[2,1],[1,2],[2,-1],[1,-2],[-2,1],[-1,2],[-2,-1],[-1,-2]]
      symbol: N
      value: 3
  render:
    tileSize: 56
    alternating: true
---
`

const OWARE_DEF = `---
title: "Oware"
slug: "oware"
parent: "mancala"
players: "2"
board: "2×6 pits"
win: "Most seeds captured"
special: "Grand slam rule"
engine:
  topology:
    type: pit
    pitsPerSide: 6
    hasStores: false
  players: [south, north]
  setup:
    seedsPerPit: 4
  render:
    pitRadius: 28
---
`

const HEX_DEF = `---
title: "Hex"
slug: "standard"
parent: "hex"
players: "2"
board: "11×11"
win: "Connect sides"
special: "Swap rule"
engine:
  topology:
    type: hex
    radius: 5
  players: [black, white]
  render:
    hexSize: 30
---
`

const BACKGAMMON_DEF = `---
title: "Standard Backgammon"
slug: "standard"
parent: "backgammon"
players: "2"
board: "24-point board"
win: "Bear off all pieces"
special: "Doubling cube"
engine:
  topology:
    type: track
    positions: 24
    circuit: false
  players: [white, black]
  plugins:
    dice:
      count: 2
      sides: 6
---
`

describe('proof: schema → engine integration', () => {
  describe('grid topology (chess)', () => {
    test('definition creates a working grid topology', () => {
      const { definition } = parseGameDefinition(CHESS_DEF)
      const topo = createGridTopology(definition.topology)
      expect(topo.size).toBe(64)
      expect(topo.rows).toBe(8)
      expect(topo.cols).toBe(8)
      expect(topo.isValid(0)).toBe(true)
      expect(topo.isValid(63)).toBe(true)
      expect(topo.isValid(64)).toBe(false)
    })

    test('definition creates a working player system', () => {
      const { definition } = parseGameDefinition(CHESS_DEF)
      const ps = createPlayerSystem({ players: definition.players.names })
      const store = createStore({})
      store.claimSlice(ps.sliceName, ps.sliceName)
      store.set(ps.sliceName, ps.initState(), ps.sliceName)
      expect(ps.current(store)).toBe('white')
    })

    test('piece definitions register into piece-behaviour', () => {
      const { definition } = parseGameDefinition(CHESS_DEF)
      const registry = createPieceRegistry()
      for (const piece of definition.pieces) {
        registry.register(piece.name, {
          genMoves(topology, from, board, context) {
            if (piece.movement.type === 'slide') {
              const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]]
              return topology.rays(from, dirs).flat()
            }
            if (piece.movement.type === 'leap') {
              return topology.leapTargets(from, piece.movement.offsets)
            }
            return []
          },
        })
      }
      expect(registry.has('rook')).toBe(true)
      expect(registry.has('knight')).toBe(true)

      const topo = createGridTopology(definition.topology)
      const rookMoves = registry.genMoves('rook', topo, 0, [], {})
      expect(rookMoves.length).toBeGreaterThan(0)

      const knightMoves = registry.genMoves('knight', topo, 27, [], {})
      expect(knightMoves.length).toBe(8)
    })

    test('render config passes through to getLayout', () => {
      const { definition } = parseGameDefinition(CHESS_DEF)
      const topo = createGridTopology(definition.topology)
      const layout = topo.getLayout(definition.render)
      const dims = layout.getDimensions()
      expect(dims.width).toBe(8 * 56)
      expect(dims.height).toBe(8 * 56)
      const cells = layout.getCells()
      expect(cells).toHaveLength(64)
    })
  })

  describe('pit topology (mancala)', () => {
    test('definition creates a working pit topology', () => {
      const { definition } = parseGameDefinition(OWARE_DEF)
      const topo = createPitTopology(definition.topology)
      expect(topo.totalPits).toBe(12)
      expect(topo.pitsPerSide).toBe(6)
      expect(topo.stores).toBe(0)
    })

    test('player system uses directional names', () => {
      const { definition } = parseGameDefinition(OWARE_DEF)
      const ps = createPlayerSystem({ players: definition.players.names })
      const store = createStore({})
      store.claimSlice(ps.sliceName, ps.sliceName)
      store.set(ps.sliceName, ps.initState(), ps.sliceName)
      expect(ps.current(store)).toBe('south')
    })

    test('render config passes through to getLayout', () => {
      const { definition } = parseGameDefinition(OWARE_DEF)
      const topo = createPitTopology(definition.topology)
      const layout = topo.getLayout(definition.render)
      const cells = layout.getCells()
      expect(cells.length).toBe(12)
    })
  })

  describe('hex topology', () => {
    test('definition creates a working hex topology', () => {
      const { definition } = parseGameDefinition(HEX_DEF)
      const topo = createHexTopology(definition.topology)
      expect(topo.isValid({ q: 0, r: 0 })).toBe(true)
      expect(topo.isValid({ q: 5, r: 0 })).toBe(true)
      expect(topo.isValid({ q: 6, r: 0 })).toBe(false)
    })
  })

  describe('track topology (backgammon)', () => {
    test('definition creates a working track topology', () => {
      const { definition } = parseGameDefinition(BACKGAMMON_DEF)
      const positions = Array.from({ length: definition.topology.positions }, (_, i) => `point-${i}`)
      const topo = createTrackTopology({ ...definition.topology, positions })
      expect(topo.isValid('point-0')).toBe(true)
      expect(topo.isValid('point-23')).toBe(true)
      expect(topo.isValid('point-24')).toBe(false)
    })
  })

  describe('cross-topology: definition structure is consistent', () => {
    test('all four definitions have the same shape', () => {
      const defs = [CHESS_DEF, OWARE_DEF, HEX_DEF, BACKGAMMON_DEF].map(
        c => parseGameDefinition(c).definition
      )
      for (const def of defs) {
        expect(def).toHaveProperty('id')
        expect(def).toHaveProperty('title')
        expect(def).toHaveProperty('family')
        expect(def).toHaveProperty('topology')
        expect(def).toHaveProperty('topology.type')
        expect(def).toHaveProperty('players')
        expect(def).toHaveProperty('players.names')
        expect(def).toHaveProperty('plugins')
        expect(def).toHaveProperty('render')
      }
    })

    test('topology type determines which factory to call', () => {
      const factories = { grid: createGridTopology, hex: createHexTopology, pit: createPitTopology }
      const defs = [CHESS_DEF, OWARE_DEF, HEX_DEF].map(
        c => parseGameDefinition(c).definition
      )
      for (const def of defs) {
        const factory = factories[def.topology.type]
        expect(factory).toBeDefined()
        const topo = factory(def.topology)
        expect(topo).toBeDefined()
      }
    })
  })
})
