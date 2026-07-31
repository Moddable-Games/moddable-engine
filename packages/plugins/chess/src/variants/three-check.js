export const threeCheck = {
  key: 'threeCheck',
  label: 'Three-Check',
  group: 'Tactical',
  title: 'Three-Check',
  description: 'Standard rules, but delivering three checks to your opponent wins immediately.',
  rule: 'Board: 8x8 · Win: Checkmate or 3 checks',
  rows: 8,
  cols: 8,
  checkThreshold: 3,

  winCondition(state, ctx) {
    const threshold = ctx.config?.checkThreshold || 3
    const checks = state.checkCount || { 0: 0, 1: 0 }
    if (checks[0] >= threshold) return 'white'
    if (checks[1] >= threshold) return 'black'
    return null
  },

  evaluate(state, ctx) {
    const checks = state.checkCount || { 0: 0, 1: 0 }
    const currentPlayer = ctx.currentPlayer
    const myChecks = checks[currentPlayer] || 0
    const oppChecks = checks[1 - currentPlayer] || 0
    return myChecks * 400 - oppChecks * 400
  },

  openingBook: {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'g1f3'],
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'c7c5', 'e7e6'],
  },
}
