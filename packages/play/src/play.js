// Browser consumers: js/game-play.js, js/play.js, js/create.js
import { createGameFromDefinition } from '../../game/index.js'
import { produce } from '../../schema/index.js'
import { getVariantConfig, hasVariant, getSlugForKey, setVariantSources as _setVariantSources } from './variant-registry.js'
import { definitionFromVariant } from './variant-definition.js'
import { parseVariantKey, applyFlags, familySupportsFlag, registerPluginFlags } from './variant-flags.js'
import { registerSearchPolicies } from './search-policy-registry.js'
import { registerFamilyInteraction } from './interaction.js'
import { registerMctsDefault } from './mcts-registry.js'
import { resolveVariantSync } from './resolve-frontmatter.js'
import { createGridTopology } from '../../topologies/grid/index.js'
import { createHexTopology } from '../../topologies/hex/index.js'
import { createTrackTopology } from '../../topologies/track/index.js'
import { createPitTopology } from '../../topologies/pit/index.js'
import { createGraphTopology } from '../../topologies/graph/index.js'
import { createTableauTopology } from '../../topologies/tableau/index.js'
import { createGoPlugin } from '../../plugins/go/index.js'
import { createReversiPlugin } from '../../plugins/reversi/index.js'
import { createDraughtsPlugin } from '../../plugins/draughts/index.js'
import { createShogiPlugin } from '../../plugins/shogi/index.js'
import { createXiangqiPlugin } from '../../plugins/xiangqi/index.js'
import { createMancalaPlugin } from '../../plugins/mancala/index.js'
import { createMorrisPlugin } from '../../plugins/morris/index.js'
import { createHexPlugin } from '../../plugins/hex/index.js'
import { createChessPlugin } from '../../plugins/chess/index.js'
import { createStandard52Deck } from '../../component-deck/index.js'
import GENERATED_DEFAULTS from '../../../play/family-defaults.json' with { type: 'json' }

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
  reversi: createReversiPlugin,
  shogi: createShogiPlugin,
  xiangqi: createXiangqiPlugin,
  mancala: createMancalaPlugin,
  morris: createMorrisPlugin,
  hex: createHexPlugin,
}

export function registerTopology(type, factory) {
  TOPOLOGIES[type] = factory
}

export function registerPluginFactory(family, factory) {
  PLUGIN_FACTORIES[family] = factory
  if (factory.flags) registerPluginFlags(family, factory.flags)
  if (factory.interaction) registerFamilyInteraction(family, factory.interaction)
  if (factory.mcts) registerMctsDefault(family)
  if (factory.searchPolicies) registerSearchPolicies(family, factory.searchPolicies)
}

// Register plugin-declared flags, interaction models, and MCTS defaults (static properties on factory functions)
for (const [family, factory] of Object.entries(PLUGIN_FACTORIES)) {
  if (factory.flags) registerPluginFlags(family, factory.flags)
  if (factory.interaction) registerFamilyInteraction(family, factory.interaction)
  if (factory.mcts) registerMctsDefault(family)
  if (factory.searchPolicies) registerSearchPolicies(family, factory.searchPolicies)
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
  const { variant, definition: userDefinition, rngSeed } = opts

  const factory = PLUGIN_FACTORIES[family]
  if (!factory) {
    throw new Error(`Unknown game family: "${family}". Available: ${Object.keys(PLUGIN_FACTORIES).join(', ')}`)
  }

  const { base, flags } = variant ? parseVariantKey(variant) : { base: variant, flags: [] }
  let definition = userDefinition
    ? (userDefinition.topology !== undefined ? userDefinition : produce(userDefinition))
    : produce(resolveMeta(family, base || variant))
  const usableFlags = flags.filter(f => familySupportsFlag(family, f))
  if (usableFlags.length) definition = applyFlags(definition, usableFlags)

  const effectiveSeed = rngSeed !== undefined ? rngSeed : Date.now() ^ (Math.random() * 0x7fffffff | 0)

  const gameOpts = {
    topologies: TOPOLOGIES,
    pluginFactories: { [family]: factory },
    components: COMPONENT_FACTORIES,
    rngSeed: effectiveSeed,
  }

  const game = createGameFromDefinition(definition, gameOpts)

  // The store keys a plugin's state by the plugin's own `sliceName`, not by the
  // family. All six shipped plugins happen to set the two equal, which hid the
  // fact that everything below assumed it. A plugin that names its slice
  // anything else kept working through getLegalMoves and applyMove while
  // getState returned undefined and loadState wrote where nothing reads - a
  // game that looks fine until someone tries to save it.
  const familyPlugin = game.registry.getPlugins().find(p => p.sliceName === family)
    || game.registry.getPlugins().find(p => typeof p.getLegalMoves === 'function')
  const sliceKey = familyPlugin?.sliceName || family

  return {
    getLegalMoves() {
      return game.getLegalMoves()
    },

    applyMove(move) {
      return game.execute(move)
    },

    checkWin() {
      const slice = game.getState(sliceKey)
      const plugin = familyPlugin
      if (plugin && plugin.checkWin) {
        return plugin.checkWin(slice, game.store.getAll())
      }
      return null
    },

    getState() {
      return {
        family,
        currentPlayer: game.currentPlayer(),
        slice: game.getState(sliceKey),
        players: game.store.get('__players'),
      }
    },

    loadState(state) {
      if (state.slice) {
        game.store.set(sliceKey, state.slice, sliceKey)
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
      const slice = game.getState(sliceKey)
      const plugin = familyPlugin
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

let _readFile = null

export function setRulesReader(readFn, listFn) {
  _readFile = readFn
  if (listFn) {
    _setVariantSources(listFn, readFn)
  }
}

export const STRUCTURAL_KEYS = new Set(['topology', 'players', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces'])

export function resolveFromDisk(family, variant) {
  if (!_readFile) return null
  const slug = getSlugForKey(family, variant)
  return resolveVariantSync(family, slug, _readFile)
}

function resolveMeta(family, variant) {
  const registryConfig = variant && hasVariant(family, variant) ? getVariantConfig(family, variant) : null

  if (registryConfig) {
    const resolved = resolveFromDisk(family, variant)
    if (resolved) {
      const topo = resolved.topology || {}
      const players = resolved.players || ['white', 'black']
      const pluginConfig = {}
      if (resolved.plugins && resolved.plugins[family]) {
        Object.assign(pluginConfig, resolved.plugins[family])
      }
      for (const [k, v] of Object.entries(resolved)) {
        if (STRUCTURAL_KEYS.has(k)) continue
        if (v !== undefined) pluginConfig[k] = v
      }
      for (const [k, v] of Object.entries(registryConfig)) {
        if (k === 'key' || STRUCTURAL_KEYS.has(k)) continue
        pluginConfig[k] = v
      }
      const def = {
        title: resolved.meta?.label || variant,
        slug: variant,
        parent: family,
        engine: { players, plugins: { [family]: pluginConfig } },
      }
      if (topo.type) def.engine.topology = { ...topo }
      return def
    }
    const defaults = DEFAULT_DEFINITIONS[family]
    const base = defaults ? (defaults.default.engine || {}) : {}
    return definitionFromVariant(family, registryConfig, {
      topology: base.topology || {},
      players: base.players,
    })
  }

  const resolved = variant ? resolveFromDisk(family, variant) : null
  if (resolved) {
    const topo = resolved.topology || {}
    const players = resolved.players || ['white', 'black']
    const pluginConfig = {}
    if (resolved.plugins && resolved.plugins[family]) {
      Object.assign(pluginConfig, resolved.plugins[family])
    }
    for (const [k, v] of Object.entries(resolved)) {
      if (STRUCTURAL_KEYS.has(k)) continue
      if (v !== undefined) pluginConfig[k] = v
    }
    const def = {
      title: resolved.meta?.label || variant,
      slug: variant,
      parent: family,
      engine: { players, plugins: { [family]: pluginConfig } },
    }
    if (topo.type) def.engine.topology = { ...topo }
    if (resolved.render) def.engine.render = resolved.render
    if (resolved.pieces) def.engine.pieces = resolved.pieces
    if (resolved.components) def.engine.components = resolved.components
    if (resolved.surface) def.engine.surface = resolved.surface
    return def
  }

  if (variant) {
    throw new Error(`Unknown variant "${variant}" for family "${family}". Not in registry and not found on disk.`)
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

const DEFAULT_DEFINITIONS = GENERATED_DEFAULTS
