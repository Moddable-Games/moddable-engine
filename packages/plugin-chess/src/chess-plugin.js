import { rider, leaper, compose, divergent, fromConfig, OFFSETS } from '../../piece-behaviour/index.js'

const DEFAULT_VOCABULARY = {
  king:   { symbols: { 0: 'K', 1: 'k' } },
  queen:  { symbols: { 0: 'Q', 1: 'q' } },
  rook:   { symbols: { 0: 'R', 1: 'r' } },
  bishop: { symbols: { 0: 'B', 1: 'b' } },
  knight: { symbols: { 0: 'N', 1: 'n' } },
  pawn:   { symbols: { 0: 'P', 1: 'p' } },
}

const STANDARD_PIECES = {
  king:   { type: 'rider', dirs: 'all', maxSteps: 1, royal: true },
  queen:  { type: 'rider', dirs: 'all' },
  rook:   { type: 'rider', dirs: 'orthogonal' },
  bishop: { type: 'rider', dirs: 'diagonal' },
  knight: { type: 'leaper', offsets: 'knight' },
  pawn:   { movement: 'pawn' },
}

const DEFAULT_SETUP = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

export function createChessPlugin(variantConfig = {}, context = {}) {
  const config = {
    advancement: variantConfig.advancement || { 0: -1, 1: 1 },
    promotionRanks: variantConfig.promotionRanks || { 0: 0, 1: null },
    promotionChoices: variantConfig.promotionChoices || ['queen', 'rook', 'bishop', 'knight'],
    castling: variantConfig.castling !== false,
    enPassant: variantConfig.enPassant !== false,
    setup: variantConfig.setup || DEFAULT_SETUP,
    royalType: variantConfig.royalType || 'king',
    pawnType: variantConfig.pawnType || 'pawn',
    ...variantConfig,
  }

  const pieceConfigs = { ...STANDARD_PIECES, ...config.pieces }
  const vocabulary = { ...DEFAULT_VOCABULARY, ...config.vocabulary }

  const builtPieces = new Map()

  function buildPiece(name) {
    if (builtPieces.has(name)) return builtPieces.get(name)
    const pConfig = pieceConfigs[name]
    if (!pConfig || pConfig.movement === 'pawn') {
      builtPieces.set(name, null)
      return null
    }
    const primitive = fromConfig(pConfig)
    builtPieces.set(name, primitive)
    return primitive
  }

  let topology = null

  function init(pluginConfig, { request }) {
    topology = request('core.topology')
    const setupStr = pluginConfig.setup || config.setup

    let board
    if (topology && topology.parsePosition) {
      board = topology.parsePosition(setupStr, vocabulary)
    } else {
      board = parseFENtoArray(setupStr)
    }

    const promotionRanks = { ...config.promotionRanks }
    if (promotionRanks[1] === null && topology) {
      promotionRanks[1] = topology.rows - 1
    }
    config.promotionRanks = promotionRanks

    const state = {
      board,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    }

    if (config.castling) {
      state.castlingRights = { 0: { king: true, queen: true }, 1: { king: true, queen: true } }
    }
    if (config.enPassant) {
      state.enPassantTarget = null
    }

    return state
  }

  function parseFENtoArray(fen) {
    const cols = topology ? topology.cols : 8
    const rows = topology ? topology.rows : 8
    const board = new Array(rows * cols).fill(null)
    const rowStrings = fen.split('/')
    const symbolLookup = buildReverseVocab()
    let idx = 0
    for (const row of rowStrings) {
      for (const ch of row) {
        if (ch >= '1' && ch <= '9') {
          idx += parseInt(ch, 10)
        } else {
          board[idx] = symbolLookup(ch)
          idx++
        }
      }
    }
    return board
  }

  function buildReverseVocab() {
    const map = new Map()
    for (const [type, def] of Object.entries(vocabulary)) {
      for (const [owner, symbol] of Object.entries(def.symbols)) {
        map.set(symbol, { type, owner: parseInt(owner) })
      }
    }
    return (ch) => map.get(ch) || null
  }

  function buildViewBoard(board, playerIdx) {
    return board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === playerIdx, enemy: cell.owner !== playerIdx, ...cell }
    })
  }

  function generateMovesForPiece(from, slice, playerIdx) {
    const piece = slice.board[from]
    if (!piece) return []
    const pConfig = pieceConfigs[piece.type]
    if (!pConfig) return []

    if (pConfig.movement === 'pawn') {
      return generatePawnMoves(from, slice, playerIdx)
    }

    const primitive = buildPiece(piece.type)
    if (!primitive) return []

    const viewBoard = buildViewBoard(slice.board, playerIdx)
    return primitive.genMoves(topology, from, viewBoard)
  }

  function generatePawnMoves(from, slice, playerIdx) {
    const moves = []
    const dir = typeof config.advancement === 'function'
      ? config.advancement(playerIdx)
      : config.advancement[playerIdx]
    const cols = topology.cols
    const rows = topology.rows
    const fromRow = Math.floor(from / cols)
    const fromCol = from % cols
    const startRow = dir === -1 ? rows - 2 : 1
    const promoRank = config.promotionRanks[playerIdx]

    const forward = from + dir * cols
    if (forward >= 0 && forward < slice.board.length && slice.board[forward] === null) {
      const targetRow = Math.floor(forward / cols)
      if (targetRow === promoRank) {
        for (const promo of config.promotionChoices) {
          moves.push({ from, to: forward, promotion: promo })
        }
      } else {
        moves.push({ from, to: forward })
      }

      if (fromRow === startRow) {
        const doubleForward = from + dir * cols * 2
        if (doubleForward >= 0 && doubleForward < slice.board.length && slice.board[doubleForward] === null) {
          moves.push({ from, to: doubleForward })
        }
      }
    }

    const captureOffsets = [dir * cols - 1, dir * cols + 1]
    for (const offset of captureOffsets) {
      const target = from + offset
      if (target < 0 || target >= slice.board.length) continue
      const targetCol = target % cols
      if (Math.abs(targetCol - fromCol) !== 1) continue

      if (slice.board[target] !== null && slice.board[target].owner !== playerIdx) {
        const targetRow = Math.floor(target / cols)
        if (targetRow === promoRank) {
          for (const promo of config.promotionChoices) {
            moves.push({ from, to: target, capture: true, promotion: promo })
          }
        } else {
          moves.push({ from, to: target, capture: true })
        }
      }

      if (config.enPassant && target === slice.enPassantTarget) {
        const capturedPawn = target - dir * cols
        moves.push({ from, to: target, capture: true, enPassant: true, captured: capturedPawn })
      }
    }

    return moves
  }

  function generateCastlingMoves(kingFrom, slice, playerIdx) {
    if (!config.castling || !slice.castlingRights) return []
    const rights = slice.castlingRights[playerIdx]
    if (!rights || (!rights.king && !rights.queen)) return []

    const cols = topology.cols
    const kingRow = Math.floor(kingFrom / cols)
    const moves = []

    if (rights.king) {
      const rookPos = findRookForSide(slice.board, playerIdx, 'king', kingFrom, cols)
      if (rookPos !== -1) {
        const kingDest = kingRow * cols + 6
        const rookDest = kingRow * cols + 5
        if (canCastle(slice, playerIdx, kingFrom, kingDest, rookPos, rookDest)) {
          moves.push({ from: kingFrom, to: kingDest, castle: true, rookFrom: rookPos, rookTo: rookDest })
        }
      }
    }

    if (rights.queen) {
      const rookPos = findRookForSide(slice.board, playerIdx, 'queen', kingFrom, cols)
      if (rookPos !== -1) {
        const kingDest = kingRow * cols + 2
        const rookDest = kingRow * cols + 3
        if (canCastle(slice, playerIdx, kingFrom, kingDest, rookPos, rookDest)) {
          moves.push({ from: kingFrom, to: kingDest, castle: true, rookFrom: rookPos, rookTo: rookDest })
        }
      }
    }

    return moves
  }

  function findRookForSide(board, owner, side, kingPos, cols) {
    const kingCol = kingPos % cols
    const kingRow = Math.floor(kingPos / cols)
    const rookType = config.rookType || 'rook'

    if (side === 'king') {
      for (let c = cols - 1; c > kingCol; c--) {
        const idx = kingRow * cols + c
        if (board[idx] && board[idx].type === rookType && board[idx].owner === owner) return idx
      }
    } else {
      for (let c = 0; c < kingCol; c++) {
        const idx = kingRow * cols + c
        if (board[idx] && board[idx].type === rookType && board[idx].owner === owner) return idx
      }
    }
    return -1
  }

  function canCastle(slice, playerIdx, kingFrom, kingDest, rookFrom, rookDest) {
    const board = slice.board
    if (!board[rookFrom]) return false

    const minSq = Math.min(kingFrom, kingDest, rookFrom, rookDest)
    const maxSq = Math.max(kingFrom, kingDest, rookFrom, rookDest)
    for (let sq = minSq; sq <= maxSq; sq++) {
      if (sq === kingFrom || sq === rookFrom) continue
      if (board[sq] !== null) return false
    }

    const step = kingDest > kingFrom ? 1 : -1
    for (let sq = kingFrom; sq !== kingDest + step; sq += step) {
      if (isSquareAttacked(board, sq, playerIdx)) return false
    }

    return true
  }

  function isSquareAttacked(board, target, defendingPlayer) {
    const attacker = 1 - defendingPlayer
    for (let i = 0; i < board.length; i++) {
      const piece = board[i]
      if (!piece || piece.owner !== attacker) continue
      if (pieceAttacks(i, target, piece, board)) return true
    }
    return false
  }

  function pieceAttacks(from, target, piece, board) {
    const pConfig = pieceConfigs[piece.type]
    if (!pConfig) return false

    if (pConfig.movement === 'pawn') {
      return pawnAttacks(from, target, piece.owner)
    }

    const primitive = buildPiece(piece.type)
    if (!primitive) return false

    const viewBoard = board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === piece.owner, enemy: cell.owner !== piece.owner, ...cell }
    })
    return primitive.attacks(topology, from, target, viewBoard)
  }

  function pawnAttacks(from, target, owner) {
    const dir = typeof config.advancement === 'function'
      ? config.advancement(owner)
      : config.advancement[owner]
    const cols = topology.cols
    const fromCol = from % cols
    const captureOffsets = [dir * cols - 1, dir * cols + 1]
    for (const offset of captureOffsets) {
      const t = from + offset
      if (t === target) {
        const tCol = t % cols
        if (Math.abs(tCol - fromCol) === 1) return true
      }
    }
    return false
  }

  function isInCheck(board, playerIdx) {
    const royalType = config.royalType || 'king'
    const kingPos = board.findIndex(c => c && c.type === royalType && c.owner === playerIdx)
    if (kingPos === -1) return true
    return isSquareAttacked(board, kingPos, playerIdx)
  }

  function validateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const piece = slice.board[move.from]
    if (!piece) return false
    if (piece.owner !== playerIdx) return false

    const legal = getLegalMoves(slice, full)
    return legal.some(m =>
      m.to === move.to &&
      m.from === move.from &&
      (move.promotion === undefined || m.promotion === move.promotion) &&
      (move.castle === undefined || m.castle === move.castle) &&
      (move.enPassant === undefined || m.enPassant === move.enPassant)
    )
  }

  function applyMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const board = [...slice.board]
    const piece = board[move.from]
    let castlingRights = slice.castlingRights ? deepCopyCastling(slice.castlingRights) : null
    let enPassantTarget = null
    let halfmoveClock = slice.halfmoveClock + 1

    if (board[move.to] !== null || piece.type === (config.pawnType || 'pawn')) {
      halfmoveClock = 0
    }

    if (move.castle) {
      board[move.to] = board[move.from]
      board[move.from] = null
      board[move.rookTo] = board[move.rookFrom]
      board[move.rookFrom] = null
      if (castlingRights) {
        castlingRights[playerIdx] = { king: false, queen: false }
      }
    } else if (move.enPassant) {
      board[move.to] = board[move.from]
      board[move.from] = null
      board[move.captured] = null
    } else {
      board[move.to] = board[move.from]
      board[move.from] = null
    }

    if (move.promotion) {
      board[move.to] = { type: move.promotion, owner: playerIdx }
    }

    const cols = topology.cols
    if (piece.type === (config.pawnType || 'pawn') && Math.abs(move.to - move.from) === cols * 2) {
      enPassantTarget = (move.from + move.to) / 2
    }

    if (castlingRights) {
      const royalType = config.royalType || 'king'
      const rookType = config.rookType || 'rook'
      if (piece.type === royalType) {
        castlingRights[playerIdx] = { king: false, queen: false }
      }
      if (piece.type === rookType) {
        updateRookCastling(move.from, playerIdx, castlingRights)
      }
      if (slice.board[move.to]?.type === rookType) {
        updateRookCastling(move.to, slice.board[move.to].owner, castlingRights)
      }
    }

    const fullmoveNumber = playerIdx === 1 ? slice.fullmoveNumber + 1 : slice.fullmoveNumber

    const newSlice = { board, halfmoveClock, fullmoveNumber }
    if (castlingRights !== null) newSlice.castlingRights = castlingRights
    if (config.enPassant) newSlice.enPassantTarget = enPassantTarget

    return newSlice
  }

  function updateRookCastling(rookPos, owner, rights) {
    if (!rights[owner]) return
    const cols = topology.cols
    const advancement = typeof config.advancement === 'function'
      ? config.advancement(owner)
      : config.advancement[owner]
    const backRank = advancement === -1 ? (topology.rows - 1) * cols : 0
    if (rookPos === backRank + cols - 1) {
      rights[owner].king = false
    } else if (rookPos === backRank) {
      rights[owner].queen = false
    }
  }

  function getLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const allMoves = []

    for (let i = 0; i < slice.board.length; i++) {
      const piece = slice.board[i]
      if (!piece || piece.owner !== playerIdx) continue
      const moves = generateMovesForPiece(i, slice, playerIdx)
      allMoves.push(...moves)

      if (piece.type === (config.royalType || 'king')) {
        allMoves.push(...generateCastlingMoves(i, slice, playerIdx))
      }
    }

    return filterLegalMoves(allMoves, slice, playerIdx)
  }

  function filterLegalMoves(moves, slice, playerIdx) {
    return moves.filter(move => {
      const testBoard = [...slice.board]
      if (move.castle) {
        testBoard[move.to] = testBoard[move.from]
        testBoard[move.from] = null
        testBoard[move.rookTo] = testBoard[move.rookFrom]
        testBoard[move.rookFrom] = null
      } else if (move.enPassant) {
        testBoard[move.to] = testBoard[move.from]
        testBoard[move.from] = null
        testBoard[move.captured] = null
      } else {
        testBoard[move.to] = testBoard[move.from]
        testBoard[move.from] = null
      }
      if (move.promotion) {
        testBoard[move.to] = { type: move.promotion, owner: playerIdx }
      }
      return !isInCheck(testBoard, playerIdx)
    })
  }

  function checkWin(slice, full) {
    const playerIdx = full.__players.currentIndex
    const opponent = 1 - playerIdx

    const oppFull = { ...full, __players: { ...full.__players, currentIndex: opponent } }
    const oppMoves = getLegalMoves(slice, oppFull)

    if (oppMoves.length === 0) {
      if (isInCheck(slice.board, opponent)) {
        return playerIdx === 0 ? 'white' : 'black'
      }
      return 'draw'
    }

    if (slice.halfmoveClock >= 100) return 'draw'

    return null
  }

  function deepCopyCastling(rights) {
    return { 0: { ...rights[0] }, 1: { ...rights[1] } }
  }

  return {
    sliceName: 'chess',
    pieceTypes: Object.keys(pieceConfigs),
    vocabulary,
    config,
    pieceConfigs,

    init,
    validateMove,
    applyMove,
    getLegalMoves,
    checkWin,
  }
}
