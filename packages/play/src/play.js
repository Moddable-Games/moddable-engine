import { createGameFromDefinition } from '../../game/src/create-game.js'
import { produce } from '../../schema/src/produce.js'
import { createGridTopology } from '../../topologies/grid/src/topology-grid.js'
import { createHexTopology } from '../../topologies/hex/src/topology-hex.js'
import { createTrackTopology } from '../../topologies/track/src/topology-track.js'
import { createPitTopology } from '../../topologies/pit/src/topology-pit.js'
import { createGraphTopology } from '../../topologies/graph/src/topology-graph.js'
import { createTableauTopology } from '../../topologies/tableau/src/topology-tableau.js'
import { createGoPlugin } from '../../plugins/go/src/go-plugin.js'
import { createMancalaPlugin } from '../../plugins/mancala/src/mancala-plugin.js'
import { createMorrisPlugin } from '../../plugins/morris/src/morris-plugin.js'
import { createBackgammonPlugin } from '../../plugins/backgammon/src/backgammon-plugin.js'
import { createDraughtsPlugin } from '../../plugins/draughts/src/draughts-plugin.js'
import { createReversiPlugin } from '../../plugins/reversi/src/reversi-plugin.js'
import { createHalmaPlugin } from '../../plugins/halma/src/halma-plugin.js'
import { createShogiPlugin } from '../../plugins/shogi/src/shogi-plugin.js'
import { createXiangqiPlugin } from '../../plugins/xiangqi/src/xiangqi-plugin.js'
import { createRacePlugin } from '../../plugins/race/src/race-plugin.js'
import { createHexPlugin } from '../../plugins/hex/src/hex-plugin.js'
import { createChessPlugin } from '../../plugins/chess/src/chess-plugin.js'
import { createBig2Plugin } from '../../plugins/big2/src/big2-plugin.js'
import { createStandard52Deck } from '../../component-deck/src/standard-52.js'

const TOPOLOGIES = {
  grid: (config) => createGridTopology(config),
  hex: (config) => createHexTopology(config),
  track: (config) => createTrackTopology(config),
  pit: (config) => createPitTopology(config),
  graph: (config) => createGraphTopology(config),
  tableau: (config) => createTableauTopology(config),
}

const PLUGIN_FACTORIES = {
  backgammon: createBackgammonPlugin,
  big2: createBig2Plugin,
  chess: createChessPlugin,
  draughts: createDraughtsPlugin,
  go: createGoPlugin,
  halma: createHalmaPlugin,
  hex: createHexPlugin,
  mancala: createMancalaPlugin,
  morris: createMorrisPlugin,
  race: createRacePlugin,
  reversi: createReversiPlugin,
  shogi: createShogiPlugin,
  xiangqi: createXiangqiPlugin,
}

const COMPONENT_FACTORIES = {
  'deck.standard-52': () => createStandard52Deck(),
}

export function getPlugin(family) {
  const factory = PLUGIN_FACTORIES[family]
  if (!factory) return null
  return { factory }
}

export function getFamilies() {
  return Object.keys(PLUGIN_FACTORIES)
}

export function hasFamily(family) {
  return family in PLUGIN_FACTORIES
}

export function createGameForFamily(family, opts = {}) {
  const { variant, definition: userDefinition, rngSeed = 42 } = opts

  const factory = PLUGIN_FACTORIES[family]
  if (!factory) {
    throw new Error(`Unknown game family: "${family}". Available: ${Object.keys(PLUGIN_FACTORIES).join(', ')}`)
  }

  const definition = userDefinition
    ? (userDefinition.topology !== undefined ? userDefinition : produce(userDefinition))
    : produce(getDefaultMeta(family, variant))

  const gameOpts = {
    topologies: TOPOLOGIES,
    pluginFactories: { [family]: factory },
    components: COMPONENT_FACTORIES,
    rngSeed,
  }

  const game = createGameFromDefinition(definition, gameOpts)

  return {
    getLegalMoves() {
      return game.getLegalMoves()
    },

    applyMove(move) {
      return game.execute(move)
    },

    checkWin() {
      const slice = game.getState(family)
      const plugin = game.registry.getPlugins().find(p => p.sliceName === family)
      if (plugin && plugin.checkWin) {
        return plugin.checkWin(slice, game.store.getAll())
      }
      return null
    },

    getState() {
      return {
        family,
        currentPlayer: game.currentPlayer(),
        slice: game.getState(family),
        players: game.store.get('__players'),
      }
    },

    loadState(state) {
      if (state.slice) {
        game.store.set(family, state.slice, family)
      }
      if (state.players) {
        game.store.set('__players', state.players, '__players')
      }
    },

    currentPlayer() {
      return game.currentPlayer()
    },

    undo() {
      return game.undo()
    },

    get topology() {
      return game.topology
    },

    get raw() {
      return game
    },
  }
}

function getDefaultMeta(family, variant) {
  const defaults = DEFAULT_DEFINITIONS[family]
  if (!defaults) {
    throw new Error(`No default definition for family: "${family}". Provide a definition via opts.definition.`)
  }
  if (variant && defaults.variants && defaults.variants[variant]) {
    return defaults.variants[variant]
  }
  return defaults.default
}

const DEFAULT_DEFINITIONS = {
  go: {
    default: {
      title: 'Go 19x19',
      slug: 'standard',
      parent: 'go',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 19, cols: 19 },
        players: ['black', 'white'],
        plugins: { go: { size: 361 } },
      },
    },
    variants: {
      '9x9': {
        title: 'Go 9x9',
        slug: '9x9',
        parent: 'go',
        players: '2',
        engine: {
          topology: { type: 'grid', rows: 9, cols: 9 },
          players: ['black', 'white'],
          plugins: { go: { size: 81 } },
        },
      },
      '13x13': {
        title: 'Go 13x13',
        slug: '13x13',
        parent: 'go',
        players: '2',
        engine: {
          topology: { type: 'grid', rows: 13, cols: 13 },
          players: ['black', 'white'],
          plugins: { go: { size: 169 } },
        },
      },
    },
  },
  chess: {
    default: {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
        plugins: { chess: { setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' } },
      },
    },
  },
  mancala: {
    default: {
      title: 'Kalah',
      slug: 'kalah',
      parent: 'mancala',
      players: '2',
      engine: {
        topology: { type: 'pit', pitsPerSide: 6, hasStores: true },
        players: ['player1', 'player2'],
        plugins: { mancala: {} },
      },
    },
    variants: {
      oware: {
        title: 'Oware',
        slug: 'oware',
        parent: 'mancala',
        players: '2',
        engine: {
          topology: { type: 'pit', pitsPerSide: 6, hasStores: true },
          players: ['player1', 'player2'],
          plugins: { mancala: { seeds: 4, captureRule: 'oware', lastSeedInStore: 'none' } },
        },
      },
    },
  },
  morris: {
    default: {
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
    },
  },
  backgammon: {
    default: {
      title: 'Standard Backgammon',
      slug: 'standard',
      parent: 'backgammon',
      players: '2',
      engine: {
        players: ['white', 'black'],
        plugins: { backgammon: {} },
      },
    },
  },
  draughts: {
    default: {
      title: 'English Draughts',
      slug: 'english',
      parent: 'draughts',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
        plugins: { draughts: {} },
      },
    },
  },
  reversi: {
    default: {
      title: 'Standard Reversi',
      slug: 'standard',
      parent: 'reversi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['black', 'white'],
        plugins: { reversi: {} },
      },
    },
  },
  halma: {
    default: {
      title: 'Standard 2-Player Halma',
      slug: 'standard-2p',
      parent: 'halma',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['player1', 'player2'],
        plugins: { halma: { rows: 8, cols: 8, piecesPerPlayer: 4 } },
      },
    },
  },
  shogi: {
    default: {
      title: 'Minishogi',
      slug: 'minishogi',
      parent: 'shogi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 5, cols: 5 },
        players: ['player1', 'player2'],
        plugins: { shogi: { rows: 5, cols: 5, promotionZone: 1 } },
      },
    },
  },
  xiangqi: {
    default: {
      title: 'Standard Xiangqi',
      slug: 'standard',
      parent: 'xiangqi',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 10, cols: 9 },
        players: ['red', 'black'],
        plugins: { xiangqi: {} },
      },
    },
  },
  race: {
    default: {
      title: 'Standard Pachisi',
      slug: 'standard',
      parent: 'pachisi',
      players: '2-4',
      engine: {
        topology: { type: 'track', positions: 68 },
        players: ['red', 'yellow', 'green', 'blue'],
        plugins: { race: { positions: 68, piecesPerPlayer: 4, playerCount: 4 } },
      },
    },
  },
  hex: {
    default: {
      title: 'Hex 11x11',
      slug: 'standard',
      parent: 'hex',
      players: '2',
      engine: {
        topology: { type: 'hex', radius: 5, shape: 'rhombus' },
        players: ['black', 'white'],
        plugins: { hex: { size: 11 } },
      },
    },
  },
  big2: {
    default: {
      title: 'Big 2',
      slug: 'standard',
      parent: 'big2',
      players: '4',
      engine: {
        players: ['player1', 'player2', 'player3', 'player4'],
        components: { deck: { type: 'standard-52' } },
        plugins: { big2: { playerCount: 4 } },
      },
    },
  },
}
