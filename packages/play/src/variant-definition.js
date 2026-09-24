const PRESENTATION_KEYS = new Set([
  'key', 'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology',
])

export function pluginConfigFromVariant(config) {
  const pluginConfig = {}
  for (const [key, value] of Object.entries(config)) {
    if (PRESENTATION_KEYS.has(key)) continue
    pluginConfig[key] = value
  }
  return pluginConfig
}

export function topologyFromVariant(config, fallback = {}) {
  const declared = config.topology || {}
  if (declared.type) return { ...declared }

  const size = config.size
  const rows = config.rows || size || fallback.rows
  const cols = config.cols || size || fallback.cols
  if (!rows || !cols) return fallback.type ? { ...fallback } : null

  const topology = { type: declared.gridType || fallback.type || 'grid', rows, cols }
  if (declared.wrap) topology.wrap = declared.wrap
  if (declared.layout || fallback.layout) topology.layout = declared.layout || fallback.layout
  return topology
}

export function definitionFromVariant(family, config, defaults = {}) {
  if (config.definition) return config.definition

  const topology = topologyFromVariant(config, defaults.topology || {})
  const players = config.playerNames || defaults.players || ['player1', 'player2']

  const engine = {
    players,
    plugins: { [family]: pluginConfigFromVariant(config) },
  }
  if (topology) engine.topology = topology

  return {
    title: config.label || config.title || config.key,
    slug: config.key,
    parent: family,
    players: String(config.players || players.length || 2),
    engine,
  }
}

// The engine keys that are not plugin config. Every other key of a resolved
// engine block is folded into the plugin's config.
export const STRUCTURAL_KEYS = new Set(['topology', 'players', 'firstPlayer', 'turnOrder', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces'])

// Keys a registered variant carries for the pages, not for its plugin.
const REGISTRY_PRESENTATION_KEYS = new Set(['key', 'label', 'title', 'group', 'description', 'rule', 'board', 'extends', 'hidden', 'playerNames', 'definition', 'rows', 'cols', 'size', 'notation', 'topology', 'players'])

// The game definition for a resolved engine block: a variant file as the play
// page resolves it, or a create-page draft. It lived in the play page, where
// nothing could test the path "Try in Play" takes.
export function definitionFromResolved(family, variant, resolved, registryCfg = {}) {
  const registryTopo = registryCfg.topology || {}
  const topo = resolved.topology || {}
  const topology = topo.type ? { ...registryTopo, ...topo } : undefined
  const players = resolved.players || ['white', 'black']

  const pluginConfig = {}
  for (const [k, v] of Object.entries(registryCfg)) {
    if (REGISTRY_PRESENTATION_KEYS.has(k)) continue
    pluginConfig[k] = v
  }
  for (const [k, v] of Object.entries(resolved)) {
    if (STRUCTURAL_KEYS.has(k)) continue
    if (v !== undefined) pluginConfig[k] = v
  }
  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock) {
    for (const [k, v] of Object.entries(pluginBlock)) {
      if (v !== undefined) pluginConfig[k] = v
    }
  }

  // Who opens and in what order seats move are the game's, not the plugin's,
  // and were dropped here: the page opened every game with the first seat and
  // rotated round the table whatever the variant said.
  const engine = { players, plugins: { [family]: pluginConfig } }
  if (resolved.firstPlayer !== undefined) engine.firstPlayer = resolved.firstPlayer
  if (resolved.turnOrder !== undefined) engine.turnOrder = resolved.turnOrder
  const def = { title: resolved.meta?.label || variant, slug: variant, parent: family, engine }
  if (topology) def.engine.topology = topology
  // The deck, tiles or dice a component game is played with (engine#176).
  if (resolved.components) def.engine.components = resolved.components
  return def
}
