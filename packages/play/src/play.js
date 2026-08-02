import { createGameFromDefinition } from '../../game/src/create-game.js'
import { produce } from '../../schema/src/produce.js'
import { getVariantConfig, hasVariant } from './variant-registry.js'
import { definitionFromVariant } from './variant-definition.js'
import { createGridTopology } from '../../topologies/grid/src/topology-grid.js'
import { createHexTopology } from '../../topologies/hex/src/topology-hex.js'
import { createTrackTopology } from '../../topologies/track/src/topology-track.js'
import { createPitTopology } from '../../topologies/pit/src/topology-pit.js'
import { createGraphTopology } from '../../topologies/graph/src/topology-graph.js'
import { createTableauTopology } from '../../topologies/tableau/src/topology-tableau.js'
import { createGoPlugin } from '../../plugins/go/src/go-plugin.js'
import { createDraughtsPlugin } from '../../plugins/draughts/src/draughts-plugin.js'
import { createShogiPlugin } from '../../plugins/shogi/src/shogi-plugin.js'
import { createXiangqiPlugin } from '../../plugins/xiangqi/src/xiangqi-plugin.js'
import { createChessPlugin } from '../../plugins/chess/src/chess-plugin.js'
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
  chess: createChessPlugin,
  draughts: createDraughtsPlugin,
  go: createGoPlugin,
  shogi: createShogiPlugin,
  xiangqi: createXiangqiPlugin,
}

const COMPONENT_FACTORIES = {
  'deck.standard-52': () => createStandard52Deck(),
}

export function defaultPlayersFor(family) {
  const defaults = DEFAULT_DEFINITIONS[family]
  if (!defaults) return null
  const engine = defaults.default.engine || {}
  return engine.players || null
}

export function defaultTopologyFor(family) {
  const defaults = DEFAULT_DEFINITIONS[family]
  if (!defaults) return null
  const engine = defaults.default.engine || {}
  return engine.topology || null
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
    : produce(resolveMeta(family, variant))

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

    getVisibility(viewerIndex) {
      const slice = game.getState(family)
      const plugin = game.registry.getPlugins().find(p => p.sliceName === family)
      if (plugin && plugin.getVisibility) {
        return plugin.getVisibility(slice, game.store.getAll(), viewerIndex)
      }
      return null
    },

    get topology() {
      return game.topology
    },

    get raw() {
      return game
    },
  }
}

function resolveMeta(family, variant) {
  if (variant && hasVariant(family, variant)) {
    const config = getVariantConfig(family, variant)
    const defaults = DEFAULT_DEFINITIONS[family]
    const base = defaults ? (defaults.default.engine || {}) : {}
    return definitionFromVariant(family, config, {
      topology: base.topology || {},
      players: base.players,
    })
  }
  return getDefaultMeta(family, variant)
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
      engine: {
        topology: { type: 'grid', rows: 19, cols: 19 },
        players: ['black', 'white'],
        plugins: { go: { size: 361 } },
      },
    },
  },
  chess: {
    default: {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'chess',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
        plugins: { chess: { setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' } },
      },
    },
  },
  draughts: {
    default: {
      title: 'English Draughts',
      slug: 'english',
      parent: 'draughts',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
        plugins: { draughts: {} },
      },
    },
  },
  shogi: {
    default: {
      title: 'Minishogi',
      slug: 'minishogi',
      parent: 'shogi',
      engine: {
        topology: { type: 'grid', rows: 5, cols: 5 },
        players: ['sente', 'gote'],
        plugins: { shogi: { rows: 5, cols: 5, promotionZone: 1 } },
      },
    },
  },
  xiangqi: {
    default: {
      title: 'Standard Xiangqi',
      slug: 'standard',
      parent: 'xiangqi',
      engine: {
        topology: { type: 'grid', rows: 10, cols: 9 },
        players: ['red', 'black'],
        plugins: { xiangqi: {} },
      },
    },
  },
}
