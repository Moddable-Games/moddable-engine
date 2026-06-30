export function createRepetitionRule(config = {}) {
  const mode = config.mode || 'ko'
  const threshold = config.threshold || 3
  const stateKey = config.stateKey || 'board'
  const hashFn = config.hashFn || defaultHash

  return {
    id: 'repetition',
    category: 'constraint',
    requires: [],
    topologyNeeds: [],

    stateShape: {
      _repetitionHistory: [],
      _repetitionCounts: {},
      _lastPosition: null,
    },

    configSchema: {
      mode: { type: 'string', default: 'ko', enum: ['ko', 'superko', 'count'] },
      threshold: { type: 'number', default: 3 },
      stateKey: { type: 'string', default: 'board' },
      hashFn: { type: 'function', default: null },
    },

    hooks: {
      init(ruleConfig) {
        if (mode === 'ko') {
          return { _repetitionLastHash: null }
        }
        if (mode === 'superko') {
          return { _repetitionHistory: [] }
        }
        if (mode === 'count') {
          return { _repetitionCounts: {} }
        }
        return {}
      },

      validateMove(move, state, ctx) {
        if (mode === 'ko') {
          if (state._repetitionLastHash === null) return true
          const projected = projectState(move, state, ctx)
          if (projected === null) return true
          const hash = hashFn(projected)
          return hash !== state._repetitionLastHash
        }

        if (mode === 'superko') {
          const projected = projectState(move, state, ctx)
          if (projected === null) return true
          const hash = hashFn(projected)
          return !state._repetitionHistory.includes(hash)
        }

        return true
      },

      afterMove(move, state, ctx) {
        const current = state[stateKey]
        const hash = hashFn(current)

        if (mode === 'ko') {
          return { _repetitionLastHash: hash }
        }

        if (mode === 'superko') {
          return { _repetitionHistory: [...(state._repetitionHistory || []), hash] }
        }

        if (mode === 'count') {
          const counts = { ...(state._repetitionCounts || {}) }
          counts[hash] = (counts[hash] || 0) + 1
          return { _repetitionCounts: counts }
        }

        return null
      },

      checkWin(state, ctx) {
        if (mode === 'count') {
          const counts = state._repetitionCounts || {}
          for (const hash in counts) {
            if (counts[hash] >= threshold) return 'draw'
          }
        }
        return null
      },
    },
  }
}

function defaultHash(value) {
  if (Array.isArray(value)) {
    return value.map(c => c === null ? '.' : (typeof c === 'string' ? c[0] : JSON.stringify(c))).join('')
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

function projectState(move, state, ctx) {
  if (move.action === 'pass' || move.action === 'resign') return null
  return null
}
