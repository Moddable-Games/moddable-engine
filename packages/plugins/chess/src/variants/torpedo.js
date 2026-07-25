export const torpedo = {
  key: 'torpedo',
  label: 'Torpedo',
  group: 'Classic',
  title: 'Torpedo Chess',
  description: 'Pawns can always move two squares forward, not just from their starting rank. Makes pawns far more dynamic.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  torpedo: true,
  openingBook: {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'g1f3'],
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'd7d5', 'c7c5'],
  },
}
