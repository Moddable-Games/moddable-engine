export const PIECE_VALUES = {
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

export function reversiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  const board = state.board
  const size = Math.round(Math.sqrt(board.length))
  let score = 0

  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) continue
    const row = Math.floor(i / size)
    const col = i % size
    let weight = 100

    const isCorner = (row === 0 || row === size - 1) && (col === 0 || col === size - 1)
    const isEdge = row === 0 || row === size - 1 || col === 0 || col === size - 1
    const isXSquare = (row === 1 || row === size - 2) && (col === 1 || col === size - 2)

    if (isCorner) weight = 2500
    else if (isXSquare) weight = -500
    else if (isEdge) weight = 500

    if (board[i] === playerIndex) {
      score += weight
    } else {
      score -= weight
    }
  }

  return score
}

export function draughtsEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0
  const board = state.board
  const cols = state._cols || 8
  const rows = board.length / cols

  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    if (!piece) continue
    const row = Math.floor(i / cols)
    const value = piece.type === 'king' ? 300 : 100
    const advancement = piece.owner === 0
      ? (rows - 1 - row) * 5
      : row * 5

    if (piece.owner === playerIndex) {
      score += value + advancement
    } else {
      score -= value + advancement
    }
  }

  return score
}

export function mancalaEvaluate(state, playerIndex) {
  if (!state.stores) return 0
  const myStore = state.stores[playerIndex] || 0
  const oppStore = state.stores[1 - playerIndex] || 0
  const storeAdv = myStore - oppStore

  const half = state.pitsPerSide || 6
  const myStart = playerIndex * half
  const myPits = state.pits.slice(myStart, myStart + half)
  const oppStart = (1 - playerIndex) * half
  const oppPits = state.pits.slice(oppStart, oppStart + half)

  const mySeeds = myPits.reduce((a, b) => a + b, 0)
  const oppSeeds = oppPits.reduce((a, b) => a + b, 0)

  return (storeAdv * 3 + (mySeeds - oppSeeds)) * 20
}

export function goEvaluate(state, playerIndex) {
  if (!state.board) return 0
  const myColour = playerIndex === 0 ? 'black' : 'white'
  const oppColour = playerIndex === 0 ? 'white' : 'black'

  let myStones = 0
  let oppStones = 0
  for (const cell of state.board) {
    if (cell === myColour) myStones++
    else if (cell === oppColour) oppStones++
  }

  const captures = state.captures || {}
  const myCaps = captures[playerIndex] || 0
  const oppCaps = captures[1 - playerIndex] || 0

  return ((myStones - oppStones) + (myCaps - oppCaps) * 2) * 100
}

export function halmaEvaluate(state, playerIndex) {
  if (!state.board) return 0
  const cols = state._cols || 16
  const rows = state.board.length / cols
  let score = 0

  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] !== playerIndex) continue
    const row = Math.floor(i / cols)
    const col = i % cols
    const distToTarget = playerIndex === 0
      ? row + (cols - 1 - col)
      : (rows - 1 - row) + col
    score -= distToTarget
  }

  return score * 10
}

export function raceEvaluate(state, playerIndex) {
  if (!state.pieces) return 0
  const myPieces = state.pieces[playerIndex]
  let score = 0
  for (const piece of myPieces) {
    if (piece.state === 'finished') score += 100
    else if (piece.state === 'active') score += piece.position
    else score += 0
  }

  const oppPieces = state.pieces[1 - playerIndex] || []
  let oppScore = 0
  for (const piece of oppPieces) {
    if (piece.state === 'finished') oppScore += 100
    else if (piece.state === 'active') oppScore += piece.position
  }

  return score - oppScore
}

export function shogiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0

  const values = {
    king: 20000, rook: 500, bishop: 400, gold: 300, silver: 250,
    knight: 200, lance: 180, pawn: 80,
    promoted_rook: 600, promoted_bishop: 500,
    promoted_silver: 310, promoted_knight: 310,
    promoted_lance: 310, promoted_pawn: 310,
  }

  for (const piece of state.board) {
    if (!piece) continue
    const value = values[piece.type] || 100
    if (piece.owner === playerIndex) score += value
    else score -= value
  }

  const myHand = state.hands ? state.hands[playerIndex] : []
  const oppHand = state.hands ? state.hands[1 - playerIndex] : []
  for (const type of myHand) score += Math.round((values[type] || 100) * 0.8)
  for (const type of oppHand) score -= Math.round((values[type] || 100) * 0.8)

  return score
}

export function xiangqiEvaluate(state, playerIndex) {
  if (!state.board) return 0
  let score = 0

  const values = {
    general: 20000, chariot: 500, cannon: 350, horse: 300,
    advisor: 120, elephant: 120, soldier: 80,
  }

  for (const piece of state.board) {
    if (!piece) continue
    const value = values[piece.type] || 100
    if (piece.owner === playerIndex) score += value
    else score -= value
  }

  return score
}

export const EVALUATORS = {
  chess: chessEvaluate,
  reversi: reversiEvaluate,
  draughts: draughtsEvaluate,
  mancala: mancalaEvaluate,
  go: goEvaluate,
  halma: halmaEvaluate,
  race: raceEvaluate,
  shogi: shogiEvaluate,
  xiangqi: xiangqiEvaluate,
}
