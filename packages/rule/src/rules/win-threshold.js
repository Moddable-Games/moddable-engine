// A seat wins when a counter it owns reaches a threshold.
//
// Three chess variants implemented this as three JavaScript modules that were
// identical apart from one integer - and that integer, `checkThreshold`, was
// already declared in each variant's frontmatter. So the JS existed to restate
// a value the corpus already carried (engine#88).
//
// The counter itself is not this rule's business. Something else increments it
// (the chess plugin counts checks in its own applyMove, gated on
// `checkThreshold` being configured); this rule only reads it and decides.
// That split is deliberate: counting a check needs to know what a check is,
// which is a chess question, while "first to N wins" is not.
//
// Which is why it generalises. Asalto's Officers win by reducing the Soldiers
// below a threshold (engine#154), and that is this rule reading a different
// counter in the other direction.
export function createThresholdWinRule(config = {}) {
  const counterKey = config.counter || 'checkCount'
  const threshold = config.threshold
  const direction = config.direction === 'below' ? 'below' : 'above'

  return {
    id: 'win.threshold',
    category: 'terminal',
    requires: [],
    topologyNeeds: [],

    configSchema: {
      counter: { type: 'string', default: 'checkCount' },
      threshold: { type: 'number', default: null },
      direction: { type: 'string', default: 'above' },
    },

    hooks: {
      checkWin(state, ctx) {
        if (threshold === undefined || threshold === null) return null
        const counts = state && state[counterKey]
        if (!counts) return null

        // Seats are the counter's own keys rather than a player count, so a
        // three-seat game needs no extra configuration and a counter that only
        // tracks one seat does not report the others as being at zero.
        for (const [seat, value] of Object.entries(counts)) {
          if (typeof value !== 'number') continue
          const reached = direction === 'below' ? value <= threshold : value >= threshold
          if (reached) return Number(seat)
        }
        return null
      },
    },
  }
}
