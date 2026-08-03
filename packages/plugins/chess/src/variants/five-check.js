export const fiveCheck = {
  key: 'fiveCheck',
  label: 'Five-Check',
  group: 'Tactical',
  title: 'Five-Check',
  description: 'Extended Three-Check. Five checks wins instead of three.',
  rule: 'Board: 8x8 · Win: Checkmate or 5 checks',
  rows: 8,
  cols: 8,
  checkThreshold: 5,

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
