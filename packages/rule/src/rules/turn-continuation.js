export function createTurnContinuationRule(config = {}) {
  const mode = config.mode || 'state-flag'

  return {
    id: 'turn.continuation',
    category: 'turn',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      mode: { type: 'string', default: 'state-flag', enum: ['state-flag', 'remaining', 'predicate'] },
      field: { type: 'string', default: null },
      predicate: { type: 'function', default: null },
    },

    hooks: {
      continueTurn(move, state, ctx) {
        if (mode === 'state-flag') {
          const field = config.field
          if (!field) return false
          return !!state[field]
        }

        if (mode === 'remaining') {
          const field = config.field
          if (!field) return false
          const val = state[field]
          if (Array.isArray(val)) return val.length > 0
          if (typeof val === 'number') return val > 0
          return false
        }

        if (mode === 'predicate') {
          if (typeof config.predicate !== 'function') return false
          return config.predicate(move, state, ctx)
        }

        return false
      },
    },
  }
}
