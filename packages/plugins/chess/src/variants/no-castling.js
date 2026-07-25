export const noCastling = {
  key: 'noCastling',
  label: 'No Castling',
  group: 'Classic',
  title: 'No Castling Chess',
  description: 'Standard chess with castling disabled. Endorsed by Vladimir Kramnik. Forces creative king safety solutions.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  castling: false,
  openingBook: {
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'g1f3', 'c2c4'],
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'c7c5', 'e7e6', 'd7d5'],
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6': ['g1f3', 'b1c3', 'd2d4'],
  },
}
