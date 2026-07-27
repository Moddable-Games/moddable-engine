export const stoical = {
  key: 'stoical',
  extends: 'standard',
  label: 'Stoical Go',
  group: 'Rule Variants',
  description: 'You cannot capture on a turn immediately following a turn in which your opponent captured your stones. The restriction lasts a single turn.',
  rule: 'Board: 19×19 · Win: Most territory · No immediate retaliation',

  hooks: {
    moveFilter(moves, slice, full) {
      const playerIndex = full && full.__players ? full.__players.currentIndex : 0
      if (slice.lastCaptureBy !== 1 - playerIndex) return moves
      return moves.filter(m => m.action === 'pass' || !m.wouldCapture)
    },
  },
}
