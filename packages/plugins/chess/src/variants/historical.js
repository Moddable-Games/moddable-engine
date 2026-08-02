const bareKingWin = (state) => {
  const board = state.board
  let wCount = 0, bCount = 0, wKing = false, bKing = false
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue
    if (board[i].owner === 0) { wCount++; if (board[i].type === 'king') wKing = true }
    else { bCount++; if (board[i].type === 'king') bKing = true }
  }
  if (!wKing) return 'black'
  if (!bKing) return 'white'
  if (wCount === 1 && wKing) return 'black'
  if (bCount === 1 && bKing) return 'white'
  return null
}

export const shatranj = {
  key: 'shatranj',
  setup: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  stalemateMeaning: 'win',
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    alfil: { type: 'leaper', offsets: [[-2, -2], [-2, 2], [2, -2], [2, 2]] },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    alfil: { symbols: { 0: 'E', 1: 'e' } },
  },
  winCondition: bareKingWin,
}

export const chaturanga = {
  key: 'chaturanga',
  setup: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR',
  castling: false,
  enPassant: false,
  doubleStep: false,
  stalemateMeaning: 'win',
  promotionChoices: ['ferz'],
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    alfil: { type: 'leaper', offsets: [[-2, -2], [-2, 2], [2, -2], [2, 2]] },
  },
  vocabulary: {
    ferz: { symbols: { 0: 'F', 1: 'f' } },
    alfil: { symbols: { 0: 'E', 1: 'e' } },
  },
  winCondition: bareKingWin,
}
