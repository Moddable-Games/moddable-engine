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
