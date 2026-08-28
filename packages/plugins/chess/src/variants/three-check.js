export const threeCheck = {
  key: 'threeCheck',
  slug: 'three-check',

  evaluate(state, ctx) {
    const checks = state.checkCount || { 0: 0, 1: 0 }
    const currentPlayer = ctx.currentPlayer
    const myChecks = checks[currentPlayer] || 0
    const oppChecks = checks[1 - currentPlayer] || 0
    return myChecks * 400 - oppChecks * 400
  },

}
