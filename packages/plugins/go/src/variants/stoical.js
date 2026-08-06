export const stoical = {
  key: 'stoical',

  hooks: {
    moveFilter(moves, slice, full) {
      const playerIndex = full && full.__players ? full.__players.currentIndex : 0
      if (slice.lastCaptureBy !== 1 - playerIndex) return moves
      return moves.filter(m => m.action === 'pass' || !m.wouldCapture)
    },
  },
}
