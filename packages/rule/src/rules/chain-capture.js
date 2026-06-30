export function createChainCaptureRule(config = {}) {
  return {
    id: 'chain-capture',
    category: 'turn',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      chainDetector: { type: 'function', default: null },
    },

    hooks: {
      continueTurn(move, state, ctx) {
        if (!move.captures || move.captures.length === 0) return false
        if (typeof config.chainDetector === 'function') {
          return config.chainDetector(move, state, ctx)
        }
        return !!state._chainActive
      },
    },
  }
}
