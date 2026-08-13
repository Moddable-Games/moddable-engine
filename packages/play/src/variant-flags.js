const KNOWN_FLAGS = ['drops', 'random']

export function parseVariantKey(key) {
  if (!key || !key.includes('+')) return { base: key || '', flags: [] }
  const parts = key.split('+')
  const base = parts[0]
  const flags = parts.slice(1).sort()
  return { base, flags }
}

export function serializeVariantKey(base, flags) {
  if (!flags || !flags.length) return base
  return base + '+' + [...flags].sort().join('+')
}

export function parseUrlFlags(flagString) {
  if (!flagString) return []
  return flagString.split(',').map(f => f.trim().toLowerCase()).filter(f => KNOWN_FLAGS.includes(f)).sort()
}

export function deriveCompatibleFlags(definition) {
  if (!definition || !definition.engine) return []
  const flags = []
  if (canRandomise(definition)) flags.push('random')
  if (canDrop(definition)) flags.push('drops')
  return flags
}

function canRandomise(definition) {
  const engine = definition.engine
  if (!engine.topology || engine.topology.type !== 'grid') return false
  if (!engine.setup || !engine.setup.position) return false

  const position = engine.setup.position
  const cols = engine.topology.cols || 8
  const rows = engine.topology.rows || 8

  const board = parsePositionToBoard(position, rows, cols)
  if (!board) return false

  const lastRank = board[rows - 1]
  if (!lastRank) return false
  const filledCount = lastRank.filter(c => c !== null).length
  if (filledCount < Math.floor(cols * 0.75)) return false

  const firstRank = board[0]
  if (!firstRank) return false
  const firstFilled = firstRank.filter(c => c !== null).length
  if (firstFilled < Math.floor(cols * 0.75)) return false

  return true
}

function canDrop(definition) {
  const engine = definition.engine
  if (!engine.topology || engine.topology.type !== 'grid') return false
  if (!engine.plugins) return false

  const chessConfig = engine.plugins.chess
  if (!chessConfig) return false

  if (chessConfig.winCondition === 'antichess' || chessConfig.winCondition === 'giveaway') return false
  if (chessConfig.drops) return false

  return true
}

function parsePositionToBoard(position, rows, cols) {
  if (typeof position !== 'string') return null
  const ranks = position.split('/')
  if (ranks.length < rows) return null

  const board = []
  for (const rank of ranks.slice(0, rows)) {
    const row = []
    for (const ch of rank) {
      if (ch >= '1' && ch <= '9') {
        for (let i = 0; i < parseInt(ch); i++) row.push(null)
      } else {
        row.push(ch)
      }
    }
    while (row.length < cols) row.push(null)
    board.push(row)
  }
  return board
}

export function applyFlags(definition, flags) {
  if (!flags || !flags.length) return definition
  let result = definition
  for (const flag of [...flags].sort()) {
    if (flag === 'random') result = applyRandom(result)
    if (flag === 'drops') result = applyDrops(result)
  }
  return result
}

function applyRandom(definition) {
  const engine = { ...definition.engine }
  const plugins = { ...engine.plugins }
  const chessConfig = { ...(plugins.chess || {}) }
  chessConfig.randomSetup = true
  plugins.chess = chessConfig
  engine.plugins = plugins
  return { ...definition, engine }
}

function applyDrops(definition) {
  const engine = { ...definition.engine }
  const plugins = { ...engine.plugins }
  const chessConfig = { ...(plugins.chess || {}) }
  chessConfig.drops = true
  plugins.chess = chessConfig
  engine.plugins = plugins
  return { ...definition, engine }
}

export function flagPositionKeySuffix(flags) {
  if (!flags || !flags.length) return ''
  return ' +' + [...flags].sort().join('+')
}
