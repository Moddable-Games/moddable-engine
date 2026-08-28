export const fiveCheck = {
  key: 'fiveCheck',
  slug: 'five-check',

  evaluate(state, ctx) {
    const checks = state.checkCount || { 0: 0, 1: 0 }
    const currentPlayer = ctx.currentPlayer
    const myChecks = checks[currentPlayer] || 0
    const oppChecks = checks[1 - currentPlayer] || 0
    return myChecks * 250 - oppChecks * 250
  },
}
