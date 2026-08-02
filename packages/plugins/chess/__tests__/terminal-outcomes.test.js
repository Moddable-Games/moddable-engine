import '../index.js'
import { createGame } from '../../../play/src/sdk.js'
import { createGameForFamily } from '../../../play/src/play.js'

function setupGame(variant, fen, playerJustMoved = 0) {
  const game = createGame('chess', variant)
  const board = parseFEN(fen, game.getState().slice.board.length)
  const slice = { ...game.getState().slice, board }
  game.loadState({ slice, players: { currentIndex: playerJustMoved } })
  return game
}

function parseFEN(fen, size) {
  const cols = Math.round(Math.sqrt(size)) === 8 ? 8 : Math.round(Math.sqrt(size))
  const board = new Array(size).fill(null)
  const PIECES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' }
  const rows = fen.split('/').length <= 8 ? fen.split('/') : fen.split('/')
  let idx = 0
  for (const row of fen.split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') { idx += parseInt(ch); continue }
      const type = PIECES[ch.toUpperCase()]
      const owner = ch === ch.toUpperCase() ? 0 : 1
      if (type) board[idx] = { type, owner }
      idx++
    }
  }
  return board
}

// --- Stalemate differential ---
// One FEN, four variants, four different expected outcomes.
// Position: standard chess stalemate (black to move, not in check, no legal moves)
// k7/2Q5/1K6/8/8/8/8/8 b - - : black king a8, white Qc7 + Kb6
// a7 attacked by Q (rank), b8 attacked by Q (diagonal), b7 attacked by K
const STALEMATE_FEN = 'k7/2Q5/1K6/8/8/8/8/8'

describe('terminal-outcome: stalemate differential', () => {
  it('stalemateWins: stalemate is a win for the stalemating side (white)', () => {
    const game = setupGame('stalemateWins', STALEMATE_FEN)
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('standard: stalemate is a draw', () => {
    const game = setupGame('standard', STALEMATE_FEN)
    const result = game.checkWin()
    expect(result).toBe('draw')
  })

  it('antichess: losing all pieces wins (winCondition fires before stalemate)', () => {
    // In noCheck variants, the king can move into "check" freely, so the standard
    // stalemate FEN is not stalemate. Instead test that the winCondition fires
    // correctly when a player has no pieces.
    const game = setupGame('antichess', '8/8/8/8/8/8/8/4K3')
    // White has only a king, black has no pieces. Black's winCondition:
    // currentPlayer (0=white) checks if white has no pieces? No: checkWin checks
    // if the player who just moved (playerIdx=0) triggered a win for themselves,
    // then checks if opponent has no moves.
    // Actually antichess winCondition: checks if currentPlayer has no pieces.
    // Here white (currentPlayer=0) has a king. So null.
    // For black having no pieces: need playerIdx=1 (black just moved and lost last piece)
    const game2 = setupGame('antichess', 'K7/8/8/8/8/8/8/8', 1)
    const result = game2.checkWin()
    expect(result).toBe('black')
  })

  it('giveaway: losing all pieces wins', () => {
    const game = setupGame('giveaway', 'K7/8/8/8/8/8/8/8', 1)
    const result = game.checkWin()
    expect(result).toBe('black')
  })

  it('suicideChess: losing all pieces wins', () => {
    const game = setupGame('suicideChess', 'K7/8/8/8/8/8/8/8', 1)
    const result = game.checkWin()
    expect(result).toBe('black')
  })
})

// --- Win condition variants: fires and near-miss ---

describe('terminal-outcome: extinction', () => {
  it('fires: last knight captured', () => {
    // White has all types except knight (lost both). Black has all types.
    const game = setupGame('extinction', 'rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/R1BQKB1R')
    const result = game.checkWin()
    expect(result).toBe('black')
  })

  it('near-miss: one knight remains', () => {
    const game = setupGame('extinction', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RN1QKB1R')
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: singleCheck', () => {
  it('fires: check delivered', () => {
    // White queen on d7 checks black king on e8
    const game = setupGame('singleCheck', 'rnbqk1nr/ppp1pppp/8/3Q4/8/8/PPPPPPPP/RNB1KBNR')
    const state = game.getState().slice
    state.checkCount = { 0: 1, 1: 0 }
    game.loadState({ slice: state })
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('near-miss: no checks yet', () => {
    const game = setupGame('singleCheck', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    const state = game.getState().slice
    state.checkCount = { 0: 0, 1: 0 }
    game.loadState({ slice: state })
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: codrus', () => {
  it('fires: black king captured (black wins by losing king)', () => {
    const game = setupGame('codrus', 'rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    const result = game.checkWin()
    expect(result).toBe('black')
  })

  it('near-miss: both kings present', () => {
    const game = setupGame('codrus', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: omnicide', () => {
  it('fires: current player has no pieces', () => {
    // White to move but has no pieces (impossible in practice but tests the condition)
    const game = setupGame('omnicide', 'rnbqkbnr/pppppppp/8/8/8/8/8/8')
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('near-miss: current player has one piece', () => {
    const game = setupGame('omnicide', 'rnbqkbnr/pppppppp/8/8/8/8/8/4K3')
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: shatar', () => {
  it('fires: opponent bare king', () => {
    // Black has only a king. White has king + queen.
    const game = setupGame('shatar', '4k3/8/8/8/8/8/8/3QK3')
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('near-miss: opponent king + pawn', () => {
    const game = setupGame('shatar', '4k3/4p3/8/8/8/8/8/3QK3')
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: breakthrough', () => {
  it('fires: white pawn on far rank', () => {
    const game = createGame('chess', 'breakthrough')
    const board = new Array(49).fill(null)
    board[0] = { type: 'pawn', owner: 0 }
    board[48] = { type: 'pawn', owner: 1 }
    game.loadState({ slice: { board, _cols: 7 } })
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('near-miss: no pawn on far rank', () => {
    const game = createGame('chess', 'breakthrough')
    const board = new Array(49).fill(null)
    board[7] = { type: 'pawn', owner: 0 }
    board[41] = { type: 'pawn', owner: 1 }
    game.loadState({ slice: { board, _cols: 7 } })
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})

describe('terminal-outcome: kingOfTheHill', () => {
  it('fires: king on centre square', () => {
    const game = setupGame('kingOfTheHill', '8/8/8/3K4/8/8/8/4k3')
    const result = game.checkWin()
    expect(result).toBe('white')
  })

  it('near-miss: king adjacent to centre', () => {
    const game = setupGame('kingOfTheHill', '8/8/8/2K5/8/8/8/4k3')
    const result = game.checkWin()
    expect(result).toBeNull()
  })
})
