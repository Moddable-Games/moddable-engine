export const EMBED_COMMANDS = [
  'setVariant',
  'setFamily',
  'newGame',
  'setDifficulty',
  'setOpponent',
  'setPieces',
  'setTheme',
  'flip',
  'undo',
  'pass',
  'resign',
  'loadState',
  'requestState',
]

export const EMBED_EVENTS = ['ready', 'move', 'status', 'state', 'error']

export function parseEmbedParams(search, defaults = {}) {
  const params = new URLSearchParams(search || '')
  const embed = params.get('embed') === '1'
  return {
    embed,
    fullscreen: params.get('fullscreen') === '1',
    family: params.get('family') || params.get('game') || defaults.family || 'chess',
    variant: params.get('variant') || defaults.variant || 'standard',
    opponent: params.get('opponent') || (embed ? 'ai' : 'human'),
    difficulty: params.get('difficulty') || defaults.difficulty || 'medium',
    color: params.get('color') || defaults.color || null,
    pieces: params.get('pieces') || defaults.pieces || null,
    theme: params.get('theme') || defaults.theme || null,
    flipped: params.get('flipped') === '1',
  }
}

export function createEmbedBridge(options = {}) {
  const {
    family,
    enabled = true,
    namespace,
    legacyNamespace = null,
    target = typeof window !== 'undefined' ? window : null,
    parent = typeof window !== 'undefined' ? window.parent : null,
    handlers = {},
    origin = '*',
  } = options

  const ns = namespace || family
  const namespaces = legacyNamespace ? [ns, legacyNamespace] : [ns]
  let listener = null

  function post(type, data = {}) {
    if (!enabled || !parent || parent === target) return
    for (const name of namespaces) {
      parent.postMessage({ type: `${name}:${type}`, family, ...data }, origin)
    }
  }

  function parseCommand(rawType) {
    if (typeof rawType !== 'string') return null
    const idx = rawType.indexOf(':')
    if (idx === -1) return null
    const prefix = rawType.slice(0, idx)
    const command = rawType.slice(idx + 1)
    if (prefix !== 'game' && !namespaces.includes(prefix)) return null
    if (!EMBED_COMMANDS.includes(command)) return null
    return command
  }

  function handleMessage(event) {
    const data = event && event.data
    if (!data || typeof data.type !== 'string') return
    const command = parseCommand(data.type)
    if (!command) return
    const handler = handlers[command]
    if (typeof handler !== 'function') return
    try {
      handler(data)
    } catch (err) {
      post('error', { command, message: err && err.message ? err.message : String(err) })
    }
  }

  function start() {
    if (!enabled || !target || listener) return
    listener = handleMessage
    target.addEventListener('message', listener)
  }

  function stop() {
    if (listener && target) target.removeEventListener('message', listener)
    listener = null
  }

  if (enabled) start()

  return { post, start, stop, namespaces, parseCommand }
}

export function normaliseOutcome(outcome, playerNames = []) {
  if (outcome === null || outcome === undefined) return null
  if (typeof outcome === 'string') {
    if (outcome === 'draw' || outcome === 'scoring' || outcome === 'active') return outcome
    if (playerNames.includes(outcome)) return outcome
    return outcome
  }
  if (typeof outcome === 'number') {
    return playerNames[outcome] || String(outcome)
  }
  if (typeof outcome === 'object') {
    if (outcome.result === 'resign' && outcome.loser) {
      const winner = playerNames.find(n => n !== outcome.loser)
      return winner || 'resign'
    }
    if (outcome.winner !== undefined) return normaliseOutcome(outcome.winner, playerNames)
  }
  return String(outcome)
}

export function buildEmbedUrl(base, opts = {}) {
  const params = new URLSearchParams()
  params.set('embed', '1')
  if (opts.family) params.set('family', opts.family)
  if (opts.variant) params.set('variant', opts.variant)
  if (opts.opponent) params.set('opponent', opts.opponent)
  if (opts.difficulty) params.set('difficulty', opts.difficulty)
  if (opts.color) params.set('color', opts.color)
  if (opts.pieces) params.set('pieces', opts.pieces)
  if (opts.theme) params.set('theme', opts.theme)
  if (opts.flipped) params.set('flipped', '1')
  return `${base}?${params.toString()}`
}
