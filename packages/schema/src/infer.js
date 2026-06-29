export function inferTopology(meta, config = {}) {
  const { familyMap = DEFAULT_FAMILY_MAP, topologySchemas = [] } = config
  const family = meta.parent
  const board = meta.board || ''

  if (familyMap[family]) {
    const type = familyMap[family]
    const schema = topologySchemas.find(s => s.type === type)
    if (schema) {
      const parsed = schema.parseBoard(board)
      return parsed || { type }
    }
    return { type }
  }

  for (const schema of topologySchemas) {
    if (schema.matchBoard(board)) {
      const parsed = schema.parseBoard(board)
      return parsed || { type: schema.type }
    }
  }

  return null
}

export function inferPlayers(meta, familyPlayers = DEFAULT_FAMILY_PLAYERS) {
  const raw = meta.players || '2'
  const match = raw.match(/^(\d+)/)
  const count = match ? parseInt(match[1], 10) : 2

  const family = meta.parent
  if (count === 2 && familyPlayers[family]) {
    return familyPlayers[family]
  }

  return Array.from({ length: count }, (_, i) => `player${i + 1}`)
}

export function inferEngineBlock(meta, config = {}) {
  const { familyPlayers = DEFAULT_FAMILY_PLAYERS } = config
  const topology = inferTopology(meta, config)
  if (!topology) return null

  const block = { topology }
  const players = inferPlayers(meta, familyPlayers)
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

export const DEFAULT_FAMILY_MAP = {
  'moddable-chess': 'grid',
  'draughts': 'grid',
  'go': 'grid',
  'reversi': 'grid',
  'shogi': 'grid',
  'xiangqi': 'grid',
  'halma': 'grid',
  'stern-halma': 'grid',
  'fanorona': 'grid',
  'surakarta': 'grid',
  'mancala': 'pit',
  'backgammon': 'track',
  'pachisi': 'track',
  'chaupar': 'track',
  'royal-ur': 'track',
  'landlords-game': 'track',
  'econopoly': 'track',
  'nukes': 'hex',
  'endless-skies': 'hex',
  'hyper-imperium': 'hex',
  'hex': 'hex',
  'morris': 'graph',
}

export const DEFAULT_FAMILY_PLAYERS = {
  'moddable-chess': ['white', 'black'],
  'draughts': ['white', 'black'],
  'backgammon': ['white', 'black'],
  'go': ['black', 'white'],
  'reversi': ['black', 'white'],
  'hex': ['black', 'white'],
  'mancala': ['south', 'north'],
}
