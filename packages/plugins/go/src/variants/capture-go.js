export const captureGo = {
  key: 'capture-go',
  label: 'Capture Go',
  group: 'Teaching',
  description: 'The first player to capture any opponent stone wins immediately. No territory counting, no endgame, no passing. Also known as Atari Go.',
  rule: 'Board: 9×9 · Win: First capture',
  size: 9,
  komi: 0,
  scoring: 'capture',
  captureTarget: 1,
  allowPass: false,
  superko: false,

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
