export function produce(meta) {
  const engine = meta.engine
  const definition = {
    id: `${meta.parent}/${meta.slug}`,
    title: meta.title,
    family: meta.parent,
    slug: meta.slug,
    topology: buildTopologyConfig(engine.topology),
    players: buildPlayersConfig(engine, meta),
    plugins: buildPluginConfigs(engine),
    render: buildRenderConfig(engine),
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
  const config = { type: topo.type }

  switch (topo.type) {
    case 'grid':
      config.rows = topo.rows
      config.cols = topo.cols
      if (topo.wrap !== undefined) config.wrap = topo.wrap
      break
    case 'hex':
      config.radius = topo.radius
      if (topo.orientation) config.orientation = topo.orientation
      break
    case 'track':
      config.positions = topo.positions
      if (topo.circuit !== undefined) config.circuit = topo.circuit
      if (topo.branches) config.branches = topo.branches
      break
    case 'pit':
      config.pitsPerSide = topo.pitsPerSide
      if (topo.players !== undefined) config.players = topo.players
      if (topo.hasStores !== undefined) config.hasStores = topo.hasStores
      break
  }

  return config
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
