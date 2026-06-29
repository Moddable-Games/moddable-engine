export function produce(meta) {
  const engine = meta.engine
  const definition = {
    id: `${meta.parent}/${meta.slug}`,
    title: meta.title,
    family: meta.parent,
    slug: meta.slug,
    players: buildPlayersConfig(engine, meta),
    plugins: buildPluginConfigs(engine),
    render: buildRenderConfig(engine),
  }

  if (engine.topology) {
    definition.topology = buildTopologyConfig(engine.topology)
  }

  if (engine.pieces) {
    definition.pieces = engine.pieces.map(normalisePiece)
  }

  if (engine.setup) {
    definition.setup = engine.setup
  }

  return definition
}

function buildTopologyConfig(topo) {
  return { ...topo }
}

function buildPlayersConfig(engine, meta) {
  if (engine.players) return { names: engine.players }

  const raw = meta.players
  if (!raw) return { names: ['player1', 'player2'] }

  const match = raw.match(/^(\d+)/)
  if (match) {
    const count = parseInt(match[1], 10)
    if (count === 2) return { names: ['player1', 'player2'] }
    return { names: Array.from({ length: count }, (_, i) => `player${i + 1}`) }
  }

  return { names: ['player1', 'player2'] }
}

function buildPluginConfigs(engine) {
  if (!engine.plugins) return {}
  const configs = {}
  for (const [key, value] of Object.entries(engine.plugins)) {
    configs[key] = value || {}
  }
  return configs
}

function buildRenderConfig(engine) {
  if (!engine.render) return {}
  return { ...engine.render }
}

function normalisePiece(piece) {
  const normalised = { name: piece.name, movement: piece.movement }
  if (piece.count !== undefined) normalised.count = piece.count
  if (piece.symbol) normalised.symbol = piece.symbol
  if (piece.promotesTo) normalised.promotesTo = piece.promotesTo
  if (piece.value !== undefined) normalised.value = piece.value
  return normalised
}
