import { createGameFromDefinition } from '../../game/src/create-game.js'
import { produce } from '../../schema/src/produce.js'
import { getVariantConfig, hasVariant, setVariantSources as _setVariantSources } from './variant-registry.js'
import { definitionFromVariant } from './variant-definition.js'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { resolve as cascadeResolve } from '../../schema/src/cascade-resolver.js'
import { resolveSurface } from '../../schema/src/surfaces.js'
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

let _readFile = null

export function setRulesReader(readFn, listFn) {
  _readFile = readFn
  if (listFn) {
    _setVariantSources(listFn, readFn)
  }
}

export const STRUCTURAL_KEYS = new Set(['topology', 'players', 'meta', 'surface', 'render', 'components', 'plugins'])

function resolveFromDisk(family, variant) {
  if (!_readFile) return null

  let familyMd, variantMd
  try { familyMd = _readFile(family, 'rulebook') } catch { return null }
  try { variantMd = _readFile(family, variant) } catch { variantMd = '' }

  if (!variantMd && variant && variant !== 'standard') return null

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || '' } },
  })

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentResolved = resolveFromDisk(family, pluginBlock.extends)
    if (parentResolved) {
      const parentPlugin = parentResolved.plugins?.[family] || {}
      const merged = { ...parentPlugin, ...pluginBlock }
      delete merged.extends
      if (!resolved.plugins) resolved.plugins = {}
      resolved.plugins[family] = merged
    }
  }

  return resolved
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
      if (k === 'pieces' && v && (v.set || v.vocabulary)) continue
      if (v !== undefined) pluginConfig[k] = v
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
