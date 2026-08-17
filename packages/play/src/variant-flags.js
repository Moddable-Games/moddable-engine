const KNOWN_FLAGS = ['drops', 'random']

const FLAG_SUPPORT = {
  chess: new Set(['drops', 'random']),
}

export function familySupportsFlag(family, flag) {
  return !!FLAG_SUPPORT[family]?.has(flag)
}

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

export function deriveCompatibleFlags(definition, family) {
  if (!definition) return []
  const engine = definition.engine || definition
  const fam = family || engine.family || (engine.plugins ? Object.keys(engine.plugins)[0] : null)
  const supported = FLAG_SUPPORT[fam]
  if (!supported) return []
  const flags = []
  if (supported.has('random') && canRandomise(engine)) flags.push('random')
  if (supported.has('drops') && canDrop(engine)) flags.push('drops')
  return flags
}

function getSetupString(engine) {
  if (engine.setup && typeof engine.setup === 'string') return engine.setup
  if (engine.setup && engine.setup.position) return engine.setup.position
  const chess = engine.plugins?.chess
  if (chess && typeof chess.setup === 'string') return chess.setup
  return null
}

function canRandomise(engine) {
  const topoType = engine.topology?.type || (engine.plugins?.chess ? 'grid' : null)
  if (topoType !== 'grid') return false

  const setup = getSetupString(engine)
  if (!setup) return false
  if (setup.includes(',')) return false

  const cols = engine.topology?.cols || 8
  const rows = engine.topology?.rows || 8
  const ranks = setup.split('/')
  if (ranks.length < rows) return false

  const pawnChar = 'p'
  let hasPieceRank = false
  for (let i = Math.floor(rows / 2); i < rows; i++) {
    const chars = ranks[i].replace(/\d+/g, '').toLowerCase().split('')
    const nonPawn = chars.filter(ch => ch !== pawnChar).length
    if (nonPawn >= Math.floor(cols * 0.6)) { hasPieceRank = true; break }
  }
  return hasPieceRank
}

function canDrop(engine) {
  const topoType = engine.topology?.type || (engine.plugins?.chess ? 'grid' : null)
  if (topoType !== 'grid') return false

  const chessConfig = engine.plugins?.chess || {}
  const winCondition = chessConfig.winCondition ?? engine.winCondition
  if (winCondition === 'antichess' || winCondition === 'giveaway') return false
  if (chessConfig.drops || engine.drops) return false

  return true
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

function mergeChessFlag(definition, patch) {
  if (definition.engine && definition.engine.plugins) {
    const engine = { ...definition.engine }
    const plugins = { ...engine.plugins }
    plugins.chess = { ...(plugins.chess || {}), ...patch }
    engine.plugins = plugins
    return { ...definition, engine }
  }
  const plugins = { ...(definition.plugins || {}) }
  plugins.chess = { ...(plugins.chess || {}), ...patch }
  return { ...definition, plugins }
}

function applyRandom(definition) {
  return mergeChessFlag(definition, { randomSetup: true })
}

function applyDrops(definition) {
  return mergeChessFlag(definition, { drops: true })
}

export function flagPositionKeySuffix(flags) {
  if (!flags || !flags.length) return ''
  return ' +' + [...flags].sort().join('+')
}
