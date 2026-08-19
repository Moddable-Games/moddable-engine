const PIECE_VALUES = {
  king: 20000, queen: 900, rook: 500, bishop: 330, knight: 320, pawn: 100,
  archbishop: 650, chancellor: 830, cardinal: 650, marshal: 830,
  wazir: 830, shahzadeh: 830, rani: 150,
  fil: 330, dahja: 330, ratha: 500,
  sage: 150, man: 100,
  gold: 420, silver: 400, lance: 250, promotedPawn: 420,
  advisor: 200, guard: 250, cannon: 450, elephant: 200,
}

const PST_PAWN = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
]

const PST_KNIGHT = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
]

const PST_BISHOP = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10, 10,  5, 10, 10,  5, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
]

const PST_KING = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
]

const PST = { pawn: PST_PAWN, knight: PST_KNIGHT, bishop: PST_BISHOP, king: PST_KING }

function pstBonus(type, sq, owner) {
  const table = PST[type]
  if (!table) return 0
  const idx = owner === 0 ? sq : (56 - (sq & ~7)) + (sq & 7)
  return table[idx] || 0
}

export function chessEvaluate(state, playerIndex) {
  let score = 0
  const board = state.board
  if (!board) return 0
  const is8x8 = board.length === 64

  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    if (!piece) continue
    const value = PIECE_VALUES[piece.type] || 100
    const positional = is8x8 ? pstBonus(piece.type, i, piece.owner) : 0
    if (piece.owner === playerIndex) {
      score += value + positional
    } else {
      score -= value + positional
    }
  }

  return score
}
