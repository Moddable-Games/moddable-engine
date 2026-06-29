import { parseGameDefinition } from '../src/schema.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createRegistry } from '../../core/src/plugin-registry.js'
import { createStore } from '../../core/src/state-store.js'
import { createPlayerSystem } from '../../core/src/player-system.js'
import { createHistory } from '../../core/src/history.js'
import { createEventBus } from '../../core/src/event-bus.js'
import { createPipeline } from '../../core/src/move-pipeline.js'
import { createRng } from '../../core/src/rng.js'

const CHESS = `---
title: "Standard Chess"
slug: "standard"
parent: "moddable-chess"
players: "2"
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  players: [white, black]
  setup:
    initialBoard: [r,n,b,q,k,b,n,r,p,p,p,p,p,p,p,p,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,P,P,P,P,P,P,P,P,R,N,B,Q,K,B,N,R]
  plugins:
    chess: {}
---
`

const GO = `---
title: "Go"
slug: "standard"
parent: "go"
players: "2"
engine:
  topology:
    type: grid
    rows: 9
    cols: 9
  players: [black, white]
  plugins:
    go:
      size: 9
---
`

const MANCALA = `---
title: "Oware"
slug: "oware"
parent: "mancala"
players: "2"
engine:
  topology:
    type: pit
    pitsPerSide: 6
    hasStores: false
  players: [south, north]
  plugins:
    mancala:
      pits: 6
      seeds: 4
---
`

const BACKGAMMON = `---
title: "Standard Backgammon"
slug: "standard"
parent: "backgammon"
players: "2"
engine:
  topology:
    type: track
    positions: 24
    circuit: false
  players: [white, black]
  plugins:
    backgammon: {}
---
`

const HEX = `---
title: "Hex"
slug: "standard"
parent: "hex"
players: "2"
engine:
  topology:
    type: hex
    radius: 5
  players: [black, white]
  plugins:
    hex:
      size: 5
---
`

const BIG2 = `---
title: "Big 2"
slug: "standard"
parent: "big2"
players: "4"
engine:
  players: [player1, player2, player3, player4]
  plugins:
    big2:
      rngSeed: 77
---
`

const MORRIS = `---
title: "Nine Men's Morris"
slug: "nine-mens-morris"
parent: "morris"
players: "2"
engine:
  players: [player1, player2]
  plugins:
    morris: {}
---
`

function makeChessPlugin(setup) {
  const board = setup.initialBoard || new Array(64).fill(null)
  return {
    sliceName: 'chess',
    init() { return { board: [...board], captured: [] } },
    validateMove(move, slice) {
      return slice.board[move.from] !== null
    },
    applyMove(move, slice) {
      const b = [...slice.board]
      const captured = [...slice.captured]
      if (b[move.to] !== null) captured.push(b[move.to])
      b[move.to] = b[move.from]
      b[move.from] = null
      return { board: b, captured }
    },
    getLegalMoves(slice) { return [{ from: 0, to: 1 }] },
    checkWin(slice) {
      if (!slice.board.includes('K')) return 'black'
      if (!slice.board.includes('k')) return 'white'
      return null
    },
  }
}

function makeGoPlugin(config) {
  const size = config.size || 9
  return {
    sliceName: 'go',
    init() { return { board: new Array(size * size).fill(null), passes: 0, size } },
    validateMove(move, slice) {
      if (move.action === 'pass') return true
      return slice.board[move.coord] === null
    },
    applyMove(move, slice, full) {
      if (move.action === 'pass') return { ...slice, passes: slice.passes + 1 }
      const board = [...slice.board]
      board[move.coord] = full.__players.currentIndex === 0 ? 'black' : 'white'
      return { ...slice, board, passes: 0 }
    },
    getLegalMoves(slice) { return [{ action: 'pass' }] },
    checkWin(slice) { return slice.passes >= 2 ? 'scoring' : null },
  }
}

function makeMancalaPlugin(config) {
  const pits = config.pits || 6
  const seeds = config.seeds || 4
  return {
    sliceName: 'mancala',
    init() { return { pits: new Array(pits * 2).fill(seeds), stores: [0, 0], totalPits: pits } },
    validateMove(move, slice, full) {
      const start = full.__players.currentIndex * slice.totalPits
      const end = start + slice.totalPits
      return move.pit >= start && move.pit < end && slice.pits[move.pit] > 0
    },
    applyMove(move, slice) {
      const p = [...slice.pits]
      let s = p[move.pit]; p[move.pit] = 0
      let pos = move.pit
      while (s > 0) { pos = (pos + 1) % p.length; p[pos]++; s-- }
      return { ...slice, pits: p }
    },
    getLegalMoves(slice, full) {
      const start = full.__players.currentIndex * slice.totalPits
      const moves = []
      for (let i = start; i < start + slice.totalPits; i++) {
        if (slice.pits[i] > 0) moves.push({ pit: i })
      }
      return moves
    },
    checkWin(slice) {
      const half = slice.totalPits
      const s1 = slice.pits.slice(0, half).reduce((a, b) => a + b, 0)
      const s2 = slice.pits.slice(half).reduce((a, b) => a + b, 0)
      if (s1 === 0) return 'north'
      if (s2 === 0) return 'south'
      return null
    },
  }
}

function makeHexPlugin(config) {
  const size = config.size || 5
  return {
    sliceName: 'hex',
    init() { return { cells: {}, size } },
    validateMove(move, slice) {
      return slice.cells[`${move.q},${move.r}`] === undefined
    },
    applyMove(move, slice, full) {
      const player = full.__players.currentIndex === 0 ? 'black' : 'white'
      return { ...slice, cells: { ...slice.cells, [`${move.q},${move.r}`]: player } }
    },
    getLegalMoves(slice) {
      const moves = []
      for (let q = 0; q < slice.size; q++)
        for (let r = 0; r < slice.size; r++)
          if (!slice.cells[`${q},${r}`]) moves.push({ q, r })
      return moves
    },
    checkWin() { return null },
  }
}

function makeMorrisPlugin() {
  return {
    sliceName: 'morris',
    init() {
      const nodes = {}
      for (const k of ['a1','a4','a7','b2','b4','b6','c3','c4','c5','d1','d2','d3','d5','d6','d7','e3','e4','e5','f2','f4','f6','g1','g4','g7'])
        nodes[k] = null
      return { nodes, phase: 'place', piecesInHand: [9, 9] }
    },
    validateMove(move, slice) {
      return move.action === 'place' && slice.nodes[move.coord] === null
    },
    applyMove(move, slice, full) {
      const nodes = { ...slice.nodes }
      const player = full.__players.currentIndex === 0 ? 'player1' : 'player2'
      nodes[move.coord] = player
      const piecesInHand = [...slice.piecesInHand]
      piecesInHand[full.__players.currentIndex]--
      return { ...slice, nodes, piecesInHand }
    },
    getLegalMoves(slice) {
      return Object.entries(slice.nodes).filter(([,v]) => v === null).map(([coord]) => ({ action: 'place', coord }))
    },
    checkWin() { return null },
  }
}

function setupGame(definition, pluginFactory) {
  const registry = createRegistry()
  const pluginConfigs = definition.plugins || {}
  const mainPluginName = Object.keys(pluginConfigs)[0]
  const mainPluginConfig = pluginConfigs[mainPluginName] || {}
  const plugin = pluginFactory(mainPluginConfig, definition)
  registry.register(plugin)

  const ps = createPlayerSystem({ players: definition.players.names })
  const store = createStore({})
  registry.initAll({ [plugin.sliceName]: mainPluginConfig }, store)
  store.set(ps.sliceName, ps.initState(), ps.sliceName)
  const history = createHistory()
  const eventBus = createEventBus()
  const pipeline = createPipeline(registry, store, history, ps, eventBus)

  return { pipeline, store, playerSystem: ps, history }
}

describe('proof: schema-driven playable games', () => {
  test('chess: move a piece from definition', () => {
    const { definition } = parseGameDefinition(CHESS)
    const { pipeline, store, playerSystem } = setupGame(definition, (config, def) => makeChessPlugin(def.setup || {}))
    expect(playerSystem.current(store)).toBe('white')
    const result = pipeline.execute({ from: 48, to: 40 })
    expect(result.ok).toBe(true)
    expect(store.get('chess').board[40]).toBe('P')
    expect(playerSystem.current(store)).toBe('black')
  })

  test('go: place a stone from definition', () => {
    const { definition } = parseGameDefinition(GO)
    const { pipeline, store, playerSystem } = setupGame(definition, (config) => makeGoPlugin(config))
    expect(playerSystem.current(store)).toBe('black')
    pipeline.execute({ coord: 40 })
    expect(store.get('go').board[40]).toBe('black')
    expect(playerSystem.current(store)).toBe('white')
  })

  test('mancala: sow seeds from definition', () => {
    const { definition } = parseGameDefinition(MANCALA)
    const { pipeline, store, playerSystem } = setupGame(definition, (config) => makeMancalaPlugin(config))
    expect(playerSystem.current(store)).toBe('south')
    pipeline.execute({ pit: 0 })
    expect(store.get('mancala').pits[0]).toBe(0)
    expect(store.get('mancala').pits[1]).toBe(5)
    expect(playerSystem.current(store)).toBe('north')
  })

  test('hex: place stone from definition', () => {
    const { definition } = parseGameDefinition(HEX)
    const { pipeline, store, playerSystem } = setupGame(definition, (config) => makeHexPlugin(config))
    expect(playerSystem.current(store)).toBe('black')
    pipeline.execute({ q: 2, r: 3 })
    expect(store.get('hex').cells['2,3']).toBe('black')
    expect(playerSystem.current(store)).toBe('white')
  })

  test('morris: place piece from definition (no topology)', () => {
    const { definition } = parseGameDefinition(MORRIS)
    const { pipeline, store, playerSystem } = setupGame(definition, () => makeMorrisPlugin())
    expect(playerSystem.current(store)).toBe('player1')
    pipeline.execute({ action: 'place', coord: 'a1' })
    expect(store.get('morris').nodes.a1).toBe('player1')
    expect(playerSystem.current(store)).toBe('player2')
  })

  test('big2: no topology game from definition', () => {
    const { definition } = parseGameDefinition(BIG2)
    expect(definition.players.names).toEqual(['player1', 'player2', 'player3', 'player4'])
    expect(definition.topology).toBeUndefined()
  })

  test('all 7 games parse without error', () => {
    const defs = [CHESS, GO, MANCALA, BACKGAMMON, HEX, BIG2, MORRIS]
    for (const content of defs) {
      const result = parseGameDefinition(content)
      expect(result.ok).toBe(true)
    }
  })
})
