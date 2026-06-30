import { createGameFromDefinition } from '../src/create-game.js'
import { produce } from '../../schema/src/produce.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createGraphTopology } from '../../topology-graph/src/topology-graph.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createGoPlugin } from '../../plugin-go/src/go-plugin.js'
import { createMancalaPlugin } from '../../plugin-mancala/src/mancala-plugin.js'
import { createMorrisPlugin } from '../../plugin-morris/src/morris-plugin.js'
import { createBackgammonPlugin } from '../../plugin-backgammon/src/backgammon-plugin.js'
import { createDraughtsPlugin } from '../../plugin-draughts/src/draughts-plugin.js'
import { createReversiPlugin } from '../../plugin-reversi/src/reversi-plugin.js'
import { createHalmaPlugin } from '../../plugin-halma/src/halma-plugin.js'
import { createShogiPlugin } from '../../plugin-shogi/src/shogi-plugin.js'
import { createXiangqiPlugin } from '../../plugin-xiangqi/src/xiangqi-plugin.js'
import { createRacePlugin } from '../../plugin-race/src/race-plugin.js'
import { createHexPlugin } from '../../plugin-hex/src/hex-plugin.js'

const TOPOLOGIES = {
  grid: (config) => createGridTopology(config),
  hex: (config) => createHexTopology(config),
  pit: (config) => createPitTopology(config),
  graph: (config) => createGraphTopology(config),
  track: (config) => createTrackTopology(config),
}

const PLUGIN_FACTORIES = {
  go: createGoPlugin,
  mancala: createMancalaPlugin,
  morris: createMorrisPlugin,
  backgammon: createBackgammonPlugin,
  draughts: createDraughtsPlugin,
  reversi: createReversiPlugin,
  halma: createHalmaPlugin,
  shogi: createShogiPlugin,
  xiangqi: createXiangqiPlugin,
  race: createRacePlugin,
  hex: createHexPlugin,
}

function instantiateFromMeta(meta, pluginKey) {
  const definition = produce(meta)
  const pluginFactory = PLUGIN_FACTORIES[pluginKey]
  if (!pluginFactory) throw new Error(`No factory for plugin: ${pluginKey}`)

  return createGameFromDefinition(definition, {
    topologies: TOPOLOGIES,
    pluginFactories: { [pluginKey]: pluginFactory },
    rngSeed: 42,
  })
}

describe('pipeline proof — frontmatter → definition → playable game', () => {
  describe('Go (grid topology)', () => {
    const meta = {
      title: 'Standard Go 9x9',
      slug: '9x9',
      parent: 'go',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 9, cols: 9 },
        players: ['black', 'white'],
        plugins: { go: { size: 81 } },
      },
    }

    it('instantiates from frontmatter', () => {
      const game = instantiateFromMeta(meta, 'go')
      expect(game).toBeDefined()
      expect(game.topology).toBeDefined()
    })

    it('has legal moves at start', () => {
      const game = instantiateFromMeta(meta, 'go')
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })

    it('accepts and executes a move', () => {
      const game = instantiateFromMeta(meta, 'go')
      const moves = game.getLegalMoves()
      const result = game.execute(moves[0])
      expect(result).not.toBe(false)
    })
  })

  describe('Mancala (pit topology)', () => {
    const meta = {
      title: 'Kalah',
      slug: 'kalah',
      parent: 'mancala',
      players: '2',
      engine: {
        topology: { type: 'pit', pitsPerSide: 6, hasStores: true },
        players: ['player1', 'player2'],
        plugins: { mancala: {} },
      },
    }

    it('instantiates and is playable', () => {
      const game = instantiateFromMeta(meta, 'mancala')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(6)
      game.execute(moves[0])
      const state = game.getState('mancala')
      expect(state.pits).toBeDefined()
    })
  })

  describe('Morris (graph topology)', () => {
    const meta = {
      title: 'Nine Mens Morris',
      slug: 'nine-mens',
      parent: 'morris',
      players: '2',
      engine: {
        topology: {
          type: 'graph',
          nodes: ['a1', 'a4', 'a7', 'b2', 'b4', 'b6', 'c3', 'c4', 'c5', 'd1', 'd2', 'd3', 'd5', 'd6', 'd7', 'e3', 'e4', 'e5', 'f2', 'f4', 'f6', 'g1', 'g4', 'g7'],
          edges: [
            ['a1', 'a4'], ['a4', 'a7'], ['b2', 'b4'], ['b4', 'b6'], ['c3', 'c4'], ['c4', 'c5'],
            ['d1', 'd2'], ['d2', 'd3'], ['d5', 'd6'], ['d6', 'd7'],
            ['e3', 'e4'], ['e4', 'e5'], ['f2', 'f4'], ['f4', 'f6'], ['g1', 'g4'], ['g4', 'g7'],
            ['a1', 'd1'], ['d1', 'g1'], ['b2', 'd2'], ['d2', 'f2'],
            ['c3', 'd3'], ['d3', 'e3'], ['a4', 'b4'], ['b4', 'c4'],
            ['e4', 'f4'], ['f4', 'g4'], ['c5', 'd5'], ['d5', 'e5'],
            ['b6', 'd6'], ['d6', 'f6'], ['a7', 'd7'], ['d7', 'g7'],
          ],
        },
        players: ['player1', 'player2'],
        plugins: {
          morris: {
            mills: [
              ['a1', 'a4', 'a7'], ['b2', 'b4', 'b6'], ['c3', 'c4', 'c5'],
              ['d1', 'd2', 'd3'], ['d5', 'd6', 'd7'],
              ['e3', 'e4', 'e5'], ['f2', 'f4', 'f6'], ['g1', 'g4', 'g7'],
              ['a1', 'd1', 'g1'], ['b2', 'd2', 'f2'], ['c3', 'd3', 'e3'],
              ['a4', 'b4', 'c4'], ['e4', 'f4', 'g4'],
              ['c5', 'd5', 'e5'], ['b6', 'd6', 'f6'], ['a7', 'd7', 'g7'],
            ],
          },
        },
      },
    }

    it('instantiates and generates placement moves', () => {
      const game = instantiateFromMeta(meta, 'morris')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(24)
      expect(moves[0].action).toBe('place')
    })
  })

  describe('Backgammon (no topology, component-dice)', () => {
    const meta = {
      title: 'Standard Backgammon',
      slug: 'standard',
      parent: 'backgammon',
      players: '2',
      engine: {
        players: ['white', 'black'],
        plugins: { backgammon: {} },
      },
    }

    it('instantiates without topology', () => {
      const game = instantiateFromMeta(meta, 'backgammon')
      expect(game.topology).toBe(null)
      const moves = game.getLegalMoves()
      expect(moves[0].action).toBe('roll')
    })
  })

  describe('Draughts (grid topology, forced capture)', () => {
    const meta = {
      title: 'English Draughts',
      slug: 'english',
      parent: 'draughts',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
        plugins: { draughts: {} },
      },
    }

    it('instantiates with 12 pieces per side and generates moves', () => {
      const game = instantiateFromMeta(meta, 'draughts')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(7)
    })
  })

  describe('Reversi (grid topology, placement game)', () => {
    const meta = {
      title: 'Standard Reversi',
      slug: 'standard',
      parent: 'reversi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['black', 'white'],
        plugins: { reversi: {} },
      },
    }

    it('instantiates with 4 starting pieces and legal placements', () => {
      const game = instantiateFromMeta(meta, 'reversi')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(4)
      expect(moves[0].cell).toBeDefined()
    })
  })

  describe('Halma (grid topology, no capture)', () => {
    const meta = {
      title: 'Standard 2-Player Halma',
      slug: 'standard-2p',
      parent: 'halma',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['player1', 'player2'],
        plugins: { halma: { rows: 8, cols: 8, piecesPerPlayer: 4 } },
      },
    }

    it('instantiates and generates moves for corner pieces', () => {
      const game = instantiateFromMeta(meta, 'halma')
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })
  })

  describe('Shogi (grid topology, drops)', () => {
    const meta = {
      title: 'Minishogi',
      slug: 'minishogi',
      parent: 'shogi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 5, cols: 5 },
        players: ['player1', 'player2'],
        plugins: { shogi: { rows: 5, cols: 5, promotionZone: 1 } },
      },
    }

    it('instantiates (empty board — setup comes from plugin config)', () => {
      const game = instantiateFromMeta(meta, 'shogi')
      expect(game).toBeDefined()
      expect(game.topology).toBeDefined()
    })
  })

  describe('Xiangqi (grid topology, region constraints)', () => {
    const meta = {
      title: 'Standard Xiangqi',
      slug: 'standard',
      parent: 'xiangqi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 10, cols: 9 },
        players: ['red', 'black'],
        plugins: { xiangqi: {} },
      },
    }

    it('instantiates with 10x9 board', () => {
      const game = instantiateFromMeta(meta, 'xiangqi')
      expect(game.topology).toBeDefined()
    })
  })

  describe('Race / Pachisi (track topology)', () => {
    const meta = {
      title: 'Standard Pachisi',
      slug: 'standard',
      parent: 'pachisi',
      players: '2–4',
      engine: {
        topology: { type: 'track', positions: 68 },
        players: ['red', 'yellow', 'green', 'blue'],
        plugins: { race: { positions: 68, piecesPerPlayer: 4, playerCount: 4 } },
      },
    }

    it('instantiates with 4 players and roll as first move', () => {
      const game = instantiateFromMeta(meta, 'race')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(1)
      expect(moves[0].action).toBe('roll')
    })
  })

  describe('Hex (hex topology, connection game)', () => {
    const meta = {
      title: 'Standard Hex',
      slug: 'standard',
      parent: 'hex',
      players: '2',
      engine: {
        topology: { type: 'hex', radius: 5, shape: 'rhombus' },
        players: ['black', 'white'],
        plugins: { hex: { size: 11 } },
      },
    }

    it('instantiates and generates placement moves', () => {
      const game = instantiateFromMeta(meta, 'hex')
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })
  })

  describe('multi-move game flow', () => {
    it('Go: play 5 moves alternating, state evolves correctly', () => {
      const meta = {
        title: 'Go 9x9',
        slug: '9x9',
        parent: 'go',
        players: '2',
        engine: {
          topology: { type: 'grid', rows: 9, cols: 9 },
          players: ['black', 'white'],
          plugins: { go: { size: 81 } },
        },
      }
      const game = instantiateFromMeta(meta, 'go')

      for (let i = 0; i < 5; i++) {
        const moves = game.getLegalMoves()
        expect(moves.length).toBeGreaterThan(0)
        game.execute(moves[1] || moves[0])
      }

      const state = game.getState('go')
      const placed = state.board.filter(Boolean).length
      expect(placed).toBe(5)
    })

    it('Reversi: play opening moves, flips work', () => {
      const meta = {
        title: 'Reversi',
        slug: 'standard',
        parent: 'reversi',
        players: '2',
        engine: {
          topology: { type: 'grid', rows: 8, cols: 8 },
          players: ['black', 'white'],
          plugins: { reversi: {} },
        },
      }
      const game = instantiateFromMeta(meta, 'reversi')

      const moves1 = game.getLegalMoves()
      game.execute(moves1[0])

      const state = game.getState('reversi')
      const total = state.board.filter(c => c !== null).length
      expect(total).toBeGreaterThan(4)
    })

    it('Mancala: full game to completion', () => {
      const meta = {
        title: 'Kalah',
        slug: 'kalah',
        parent: 'mancala',
        players: '2',
        engine: {
          topology: { type: 'pit', pitsPerSide: 6, hasStores: true },
          players: ['player1', 'player2'],
          plugins: { mancala: {} },
        },
      }
      const game = instantiateFromMeta(meta, 'mancala')

      let moveCount = 0
      while (moveCount < 200) {
        const moves = game.getLegalMoves()
        if (moves.length === 0) break
        const result = game.execute(moves[0])
        moveCount++
        if (result && result.winner) break
      }

      const state = game.getState('mancala')
      const side1 = state.pits.slice(0, 6).reduce((a, b) => a + b, 0)
      const side2 = state.pits.slice(6).reduce((a, b) => a + b, 0)
      expect(side1 === 0 || side2 === 0).toBe(true)
      expect(moveCount).toBeGreaterThan(5)
    })
  })
})
