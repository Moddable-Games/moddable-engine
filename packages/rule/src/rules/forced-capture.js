export function createForcedCaptureRule(config = {}) {
  const captureDetector = config.captureDetector || defaultCaptureDetector

  return {
    id: 'forced-capture',
    category: 'constraint',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      captureDetector: { type: 'function', default: null },
      maximalCapture: { type: 'boolean', default: false },
    },

    hooks: {
      moveFilter(moves, state, ctx) {
        const captures = moves.filter(m => captureDetector(m, state, ctx))
        if (captures.length === 0) return moves

        if (config.maximalCapture) {
          const maxLen = Math.max(...captures.map(m => m.captureCount || 1))
          return captures.filter(m => (m.captureCount || 1) >= maxLen)
        }

        return captures
      },
    },
  }
}

function defaultCaptureDetector(move) {
  return move.captures && move.captures.length > 0
}
