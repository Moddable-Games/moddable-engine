export const singleCheck = {
  key: 'singleCheck',
  slug: 'single-check',

  winCondition(state, ctx) {
    const threshold = ctx.config?.checkThreshold || 1
    const checks = state.checkCount || { 0: 0, 1: 0 }
    if (checks[0] >= threshold) return 0
    if (checks[1] >= threshold) return 1
    return null
  },
}
