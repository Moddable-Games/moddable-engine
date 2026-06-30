import { slide, leap } from '../../piece-behaviour/index.js'

const DEFAULT_VOCABULARY = {
  king:   { symbols: { 0: 'K', 1: 'k' } },
  queen:  { symbols: { 0: 'Q', 1: 'q' } },
  rook:   { symbols: { 0: 'R', 1: 'r' } },
  bishop: { symbols: { 0: 'B', 1: 'b' } },
  knight: { symbols: { 0: 'N', 1: 'n' } },
  pawn:   { symbols: { 0: 'P', 1: 'p' } },
}

const DEFAULT_PIECES = {
  king:   { movement: 'slide', category: 'all', maxSteps: 1 },
  queen:  { movement: 'slide', category: 'all' },
  rook:   { movement: 'slide', category: 'orthogonal' },
  bishop: { movement: 'slide', category: 'diagonal' },
  knight: { movement: 'leap', offsets: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] },
  pawn:   { movement: 'pawn' },
}

const DEFAULT_SETUP = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

const DEFAULT_ADVANCEMENT = { 0: -1, 1: 1 }

export function createChessPlugin(variantConfig = {}, context = {}) {
  const config = {
    pieces: { ...DEFAULT_PIECES, ...variantConfig.pieces },
    advancement: variantConfig.advancement || DEFAULT_ADVANCEMENT,
    promotionRanks: variantConfig.promotionRanks || { 0: 0, 1: null },
    promotionChoices: variantConfig.promotionChoices || ['queen', 'rook', 'bishop', 'knight'],
    castling: variantConfig.castling !== false,
    enPassant: variantConfig.enPassant !== false,
    ...variantConfig,
  }

  const hooks = {
    init: defaultInit,
    validateMove: defaultValidateMove,
    applyMove: defaultApplyMove,
    getLegalMoves: defaultGetLegalMoves,
    checkWin: defaultCheckWin,
    moveFilter: defaultMoveFilter,
    captureEffect: noop,
    continueTurn: () => false,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let topology = null

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')
    const setupStr = pluginConfig.setup || config.setup || DEFAULT_SETUP
    const vocabulary = DEFAULT_VOCABULARY

    let board
    if (topology && topology.parsePosition) {
      const parsed = topology.parsePosition(setupStr, vocabulary)
      board = parsed
    } else {
      board = parseFENtoArray(setupStr)
    }

    const promotionRanks = config.promotionRanks
    if (promotionRanks[1] === null && topology) {
      promotionRanks[1] = topology.rows - 1
    }

    return {
      board,
      castlingRights: config.castling ? { 0: { king: true, queen: true }, 1: { king: true, queen: true } } : null,
      enPassantTarget: null,
      halfmoveClock: 0,
      fullmoveNumber: 1,
    }
  }

  function parseFENtoArray(fen) {
    const board = new Array(64).fill(null)
    const rows = fen.split('/')
    const symbolToType = buildReverseVocab()
    let idx = 0
    for (const row of rows) {
      for (const ch of row) {
        if (ch >= '1' && ch <= '9') {
          idx += parseInt(ch, 10)
        } else {
          board[idx] = symbolToType(ch)
          idx++
        }
      }
    }
    return board
  }

  function buildReverseVocab() {
    const map = new Map()
    for (const [type, def] of Object.entries(DEFAULT_VOCABULARY)) {
      for (const [owner, symbol] of Object.entries(def.symbols)) {
        map.set(symbol, { type, owner: parseInt(owner) })
      }
    }
    return (ch) => map.get(ch) || null
  }

  function defaultValidateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const piece = slice.board[move.from]
    if (!piece) return false
    if (piece.owner !== playerIdx) return false

    const legal = generateMovesForPiece(move.from, slice, playerIdx)
    return legal.some(m => m.to === move.to && (move.promotion === undefined || m.promotion === move.promotion))
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)
    const playerIdx = full.__players.currentIndex
    const board = [...slice.board]
    const piece = board[move.from]
    let castlingRights = slice.castlingRights ? deepCopyCastling(slice.castlingRights) : null
    let enPassantTarget = null
    let halfmoveClock = slice.halfmoveClock + 1

    if (board[move.to] !== null || piece.type === 'pawn') {
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

    if (piece.type === 'pawn' && Math.abs(move.to - move.from) === Math.abs(topology ? topology.cols * 2 : 16)) {
      enPassantTarget = (move.from + move.to) / 2
    }

    if (castlingRights) {
      if (piece.type === 'king') {
        castlingRights[playerIdx] = { king: false, queen: false }
      }
      if (piece.type === 'rook') {
        updateRookCastling(move.from, playerIdx, castlingRights)
      }
      if (board[move.to] === null && slice.board[move.to]?.type === 'rook') {
        updateRookCastling(move.to, 1 - playerIdx, castlingRights)
      }
    }

    const fullmoveNumber = playerIdx === 1 ? slice.fullmoveNumber + 1 : slice.fullmoveNumber

    const newSlice = { board, castlingRights, enPassantTarget, halfmoveClock, fullmoveNumber }
    hooks.afterMove(move, newSlice, full)
    return newSlice
  }

  function updateRookCastling(rookPos, owner, rights) {
    if (!rights[owner]) return
    const cols = topology ? topology.cols : 8
    const backRank = config.advancement[owner] === -1 ? (cols * (cols - 1)) : 0
    const kingCol = Math.floor(cols / 2)
    if (rookPos < backRank + kingCol) {
      rights[owner].queen = false
    } else {
      rights[owner].king = false
    }
  }

  function defaultGetLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const allMoves = []

    for (let i = 0; i < slice.board.length; i++) {
      const piece = slice.board[i]
      if (!piece || piece.owner !== playerIdx) continue
      const moves = generateMovesForPiece(i, slice, playerIdx)
      allMoves.push(...moves)
    }

    return hooks.moveFilter(allMoves, slice, full)
  }

  function defaultMoveFilter(moves, slice, full) {
    const playerIdx = full.__players.currentIndex
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
      return !isInCheck(testBoard, playerIdx)
    })
  }

  function defaultCheckWin(slice, full) {
    const playerIdx = full.__players.currentIndex
    const opponent = 1 - playerIdx
    const opponentMoves = getAllMovesForPlayer(slice, opponent)
    const legalOpponent = opponentMoves.filter(move => {
      const testBoard = [...slice.board]
      testBoard[move.to] = testBoard[move.from]
      testBoard[move.from] = null
      return !isInCheck(testBoard, opponent)
    })

    if (legalOpponent.length === 0) {
      if (isInCheck(slice.board, opponent)) {
        return full.__players.currentIndex === 0 ? 'white' : 'black'
      }
      return 'draw'
    }

    if (slice.halfmoveClock >= 100) return 'draw'

    return null
  }

  function getAllMovesForPlayer(slice, playerIdx) {
    const allMoves = []
    for (let i = 0; i < slice.board.length; i++) {
      const piece = slice.board[i]
      if (!piece || piece.owner !== playerIdx) continue
      allMoves.push(...generateMovesForPiece(i, slice, playerIdx))
    }
    return allMoves
  }

  function generateMovesForPiece(from, slice, playerIdx) {
    const piece = slice.board[from]
    if (!piece) return []
    const pieceDef = config.pieces[piece.type]
    if (!pieceDef) return []

    const viewBoard = buildViewBoard(slice.board, playerIdx)

    if (pieceDef.movement === 'slide') {
      const rays = topology.rays(from, pieceDef.category, pieceDef.maxSteps)
      return slide(rays, from, viewBoard, { maxSteps: pieceDef.maxSteps }).map(m => ({ ...m }))
    }

    if (pieceDef.movement === 'leap') {
      const targets = topology.leapTargets(from, pieceDef.offsets)
      return leap(targets, from, viewBoard).map(m => ({ ...m }))
    }

    if (pieceDef.movement === 'pawn') {
      return generatePawnMoves(from, slice, playerIdx, viewBoard)
    }

    return []
  }

  function generatePawnMoves(from, slice, playerIdx, viewBoard) {
    const moves = []
    const dir = config.advancement[playerIdx]
    const cols = topology.cols
    const fromRow = Math.floor(from / cols)
    const startRow = dir === -1 ? cols - 2 : 1
    const promoRank = config.promotionRanks[playerIdx]

    const forward = from + dir * cols
    if (forward >= 0 && forward < slice.board.length && slice.board[forward] === null) {
      const toRow = Math.floor(forward / cols)
      if (toRow === promoRank) {
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
    const fromCol = from % cols
    for (const offset of captureOffsets) {
      const target = from + offset
      if (target < 0 || target >= slice.board.length) continue
      const targetCol = target % cols
      if (Math.abs(targetCol - fromCol) !== 1) continue

      if (slice.board[target] !== null && slice.board[target].owner !== playerIdx) {
        const toRow = Math.floor(target / cols)
        if (toRow === promoRank) {
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

  function buildViewBoard(board, playerIdx) {
    return board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === playerIdx, enemy: cell.owner !== playerIdx, ...cell }
    })
  }

  function isInCheck(board, playerIdx) {
    const kingPos = board.findIndex(c => c && c.type === 'king' && c.owner === playerIdx)
    if (kingPos === -1) return true

    const opponent = 1 - playerIdx
    for (let i = 0; i < board.length; i++) {
      const piece = board[i]
      if (!piece || piece.owner !== opponent) continue
      if (attacks(i, kingPos, piece, board, opponent)) return true
    }
    return false
  }

  function attacks(from, target, piece, board, playerIdx) {
    const pieceDef = config.pieces[piece.type]
    if (!pieceDef) return false

    if (pieceDef.movement === 'slide') {
      const rays = topology.rays(from, pieceDef.category, pieceDef.maxSteps)
      for (const ray of rays) {
        for (const pos of ray) {
          if (pos === target) return true
          if (board[pos] !== null) break
        }
      }
      return false
    }

    if (pieceDef.movement === 'leap') {
      const targets = topology.leapTargets(from, pieceDef.offsets)
      return targets.includes(target)
    }

    if (pieceDef.movement === 'pawn') {
      const dir = config.advancement[playerIdx]
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

    return false
  }

  function deepCopyCastling(rights) {
    return { 0: { ...rights[0] }, 1: { ...rights[1] } }
  }

  function noop() {}

  return {
    sliceName: 'chess',
    pieceTypes: Object.keys(config.pieces),
    vocabulary: DEFAULT_VOCABULARY,
    config,

    init(pluginConfig, capabilities) {
      return hooks.init(pluginConfig, capabilities)
    },

    validateMove(move, slice, full) {
      return hooks.validateMove(move, slice, full)
    },

    applyMove(move, slice, full) {
      return hooks.applyMove(move, slice, full)
    },

    getLegalMoves(slice, full) {
      return hooks.getLegalMoves(slice, full)
    },

    checkWin(slice, full) {
      return hooks.checkWin(slice, full)
    },
  }
}
