export const fiveCheck = {
  key: 'fiveCheck',

  winCondition(state, ctx) {
    const threshold = ctx.config?.checkThreshold || 5
    const checks = state.checkCount || { 0: 0, 1: 0 }
    if (checks[0] >= threshold) return 0
    if (checks[1] >= threshold) return 1
    return null
  },

  evaluate(state, ctx) {
    const checks = state.checkCount || { 0: 0, 1: 0 }
    const currentPlayer = ctx.currentPlayer
    const myChecks = checks[currentPlayer] || 0
    const oppChecks = checks[1 - currentPlayer] || 0
    return myChecks * 250 - oppChecks * 250
  },
}
