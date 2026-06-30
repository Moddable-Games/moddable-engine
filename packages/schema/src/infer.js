export function inferTopology(meta, config = {}) {
  const { topologySchemas = [] } = config
  const board = meta.board || ''

  for (const schema of topologySchemas) {
    if (schema.matchBoard(board)) {
      const parsed = schema.parseBoard(board)
      return parsed || { type: schema.type }
    }
  }

  return null
}

export function inferPlayers(meta) {
  const raw = meta.players || '2'
  const match = raw.match(/^(\d+)/)
  const count = match ? parseInt(match[1], 10) : 2
  return Array.from({ length: count }, (_, i) => `player${i + 1}`)
}

export function inferEngineBlock(meta, config = {}) {
  const topology = inferTopology(meta, config)
  if (!topology) return null

  const block = { topology }
  const players = inferPlayers(meta)
  if (players) block.players = players

  return block
}

export function generateEngineFrontmatter(meta, config = {}) {
  const block = inferEngineBlock(meta, config)
  if (!block) return null

  const lines = ['engine:']
  lines.push('  topology:')
  lines.push(`    type: ${block.topology.type}`)

  for (const [key, value] of Object.entries(block.topology)) {
    if (key === 'type') continue
    lines.push(`    ${key}: ${value}`)
  }

  if (block.players) {
    lines.push(`  players: [${block.players.join(', ')}]`)
  }

  return lines.join('\n')
}
