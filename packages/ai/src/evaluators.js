export const PIECE_VALUES = {
  king: 20000, queen: 900, rook: 500, bishop: 330, knight: 320, pawn: 100,
  archbishop: 650, chancellor: 830, sage: 150,
  man: 100, 'king': 300,
}

const PST_CENTER_BONUS = [
  0, 0, 0, 0, 0, 0, 0, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 20, 20, 10, 5, 0,
  0, 5, 10, 10, 10, 10, 5, 0,
  0, 5, 5, 5, 5, 5, 5, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
]

export function chessEvaluate(state, playerIndex) {
  let score = 0
  const board = state.board
  if (!board) return 0

  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    if (!piece) continue
    const value = PIECE_VALUES[piece.type] || 100
    const positional = board.length === 64 ? (PST_CENTER_BONUS[i] || 0) : 0
    if (piece.owner === playerIndex) {
      score += value + positional
    } else {
      score -= value + positional
    }
  }

  return score / 10000
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
    let weight = 1

    const isCorner = (row === 0 || row === size - 1) && (col === 0 || col === size - 1)
    const isEdge = row === 0 || row === size - 1 || col === 0 || col === size - 1
    const isXSquare = (row === 1 || row === size - 2) && (col === 1 || col === size - 2)

    if (isCorner) weight = 25
    else if (isXSquare) weight = -5
    else if (isEdge) weight = 5

    if (board[i] === playerIndex) {
      score += weight
    } else {
      score -= weight
    }
  }

  const total = board.filter(c => c !== null).length
  const mobility = total < board.length * 0.8 ? 1 : 0
  return score / 100 + mobility * 0.01
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

  return score / 1000
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

  return (storeAdv * 3 + (mySeeds - oppSeeds)) / 50
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

  return ((myStones - oppStones) + (myCaps - oppCaps) * 2) / state.board.length
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

  return score / (rows * cols)
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

  return (score - oppScore) / 400
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
  for (const type of myHand) score += (values[type] || 100) * 0.8
  for (const type of oppHand) score -= (values[type] || 100) * 0.8

  return score / 10000
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

  return score / 10000
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
