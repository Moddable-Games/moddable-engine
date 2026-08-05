export const captureGo = {
  key: 'capture-go',

  hooks: {
    moveFilter(moves) {
      return moves.filter(m => m.action !== 'pass')
    },
  },

  winCondition(slice) {
    const target = 1
    if ((slice.captures[0] || 0) >= target) return 0
    if ((slice.captures[1] || 0) >= target) return 1
    const full = slice.board.every(cell => cell !== null)
    if (full) return 'draw'
    return null
  },

  evaluate(slice, playerIndex) {
    const mine = slice.captures[playerIndex] || 0
    const theirs = slice.captures[1 - playerIndex] || 0
    return (mine - theirs) * 10000
  },
}
