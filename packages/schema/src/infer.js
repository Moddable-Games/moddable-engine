const BOARD_PATTERNS = {
  grid: /^(\d+)\s*[×x]\s*(\d+)$/,
  pit: /^(\d+)\s*[×x]\s*(\d+)\s*pits?/i,
  track: /(\d+)[- ]point/i,
  hex: /hex/i,
}

const FAMILY_TOPOLOGY = {
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
  'morris': 'grid',
}

export function inferTopology(meta) {
  const family = meta.parent
  if (FAMILY_TOPOLOGY[family]) {
    return inferTopologyConfig(FAMILY_TOPOLOGY[family], meta)
  }

  const board = meta.board || ''
  if (BOARD_PATTERNS.pit.test(board)) return inferTopologyConfig('pit', meta)
  if (BOARD_PATTERNS.track.test(board)) return inferTopologyConfig('track', meta)
  if (BOARD_PATTERNS.hex.test(board)) return inferTopologyConfig('hex', meta)
  if (BOARD_PATTERNS.grid.test(board)) return inferTopologyConfig('grid', meta)

  return null
}

function inferTopologyConfig(type, meta) {
  const board = meta.board || ''

  switch (type) {
    case 'grid': {
      const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
      if (match) {
        return { type: 'grid', rows: parseInt(match[1], 10), cols: parseInt(match[2], 10) }
      }
      return { type: 'grid' }
    }
    case 'pit': {
      const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
      if (match) {
        return { type: 'pit', pitsPerSide: parseInt(match[2], 10) }
      }
      return { type: 'pit' }
    }
    case 'track': {
      const match = board.match(/(\d+)/)
      if (match) {
        return { type: 'track', positions: parseInt(match[1], 10) }
      }
      return { type: 'track' }
    }
    case 'hex': {
      const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
      if (match) {
        return { type: 'hex', radius: Math.floor(parseInt(match[1], 10) / 2) }
      }
      return { type: 'hex' }
    }
  }

  return { type }
}

export function inferPlayers(meta) {
  const raw = meta.players || '2'
  const match = raw.match(/^(\d+)/)
  const count = match ? parseInt(match[1], 10) : 2

  if (count === 2) {
    const family = meta.parent
    if (family === 'moddable-chess' || family === 'draughts' || family === 'backgammon') {
      return ['white', 'black']
    }
    if (family === 'go' || family === 'reversi' || family === 'hex') {
      return ['black', 'white']
    }
    if (family === 'mancala') {
      return ['south', 'north']
    }
  }

  return Array.from({ length: count }, (_, i) => `player${i + 1}`)
}

export function inferEngineBlock(meta) {
  const topology = inferTopology(meta)
  if (!topology) return null

  const block = { topology }
  const players = inferPlayers(meta)
  if (players) block.players = players

  return block
}

export function generateEngineFrontmatter(meta) {
  const block = inferEngineBlock(meta)
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
