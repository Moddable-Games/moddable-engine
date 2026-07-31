export const endgameChess = {
  key: 'endgameChess',
  label: 'Endgame Chess',
  group: 'Setup Variants',
  title: 'Endgame Chess',
  description: 'Start with only pawns and kings. Pure endgame technique from move one.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  setup: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}

export const pawnsOnly = {
  key: 'pawnsOnly',
  label: 'Pawns Only',
  group: 'Setup Variants',
  title: 'Pawns Only',
  description: 'Only pawns and kings. First player to promote or checkmate wins.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  setup: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}

export const peasantsRevolt = {
  key: 'peasantsRevolt',
  label: "Peasants' Revolt",
  group: 'Setup Variants',
  title: "Peasants' Revolt",
  description: 'Asymmetric: White has king and 8 pawns against Black\'s king, 2 knights, and 8 pawns.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,
  setup: '2n1k1n1/pppppppp/8/8/8/8/PPPPPPPP/4K3',
  castling: false,
}

export const stalemateWins = {
  key: 'stalemateWins',
  label: 'Stalemate Wins',
  group: 'Alternate Rules',
  title: 'Stalemate Wins',
  description: 'Standard chess but stalemate is a win for the stalemating side.',
  rule: 'Board: 8x8 · Win: Checkmate or stalemate opponent',
  rows: 8,
  cols: 8,
  stalemateMeaning: 'win',
}

// pettyChess (5x6) and upsideDown deferred: need pawnStartRow support
// for non-standard pawn double-step rows
