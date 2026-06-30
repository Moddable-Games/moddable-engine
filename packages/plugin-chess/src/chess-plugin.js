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
    setup: variantConfig.setup || DEFAULT_SETUP,
    promotionChoices: variantConfig.promotionChoices || ['queen', 'rook', 'bishop', 'knight'],
    castling: variantConfig.castling !== false,
    enPassant: variantConfig.enPassant !== false,
    royalType: variantConfig.royalType || 'king',
    pawnType: variantConfig.pawnType || 'pawn',
    rookType: variantConfig.rookType || 'rook',
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
  let pawnConfig = null

  function derivePawnConfig(topo) {
    if (config.pawnConfig) return config.pawnConfig
    if (topo && topo.rows !== undefined && topo.cols !== undefined) {
      return deriveGridPawnConfig(topo)
    }
    return null
  }

  function deriveGridPawnConfig(topo) {
    const { rows, cols } = topo
    const advDir = config.advancement || { 0: -1, 1: 1 }
    const forwardDir = {}
    const startCells = { 0: new Set(), 1: new Set() }
    const promotionCells = { 0: new Set(), 1: new Set() }
    const captureDirections = {}

    for (const player of [0, 1]) {
      const dir = typeof advDir === 'function' ? advDir(player) : advDir[player]
      forwardDir[player] = [dir, 0]
      const startRow = dir === -1 ? rows - 2 : 1
      const promoRow = dir === -1 ? 0 : rows - 1
      for (let c = 0; c < cols; c++) {
        startCells[player].add(topo.toIndex(startRow, c))
        promotionCells[player].add(topo.toIndex(promoRow, c))
      }
      captureDirections[player] = [[dir, -1], [dir, 1]]
    }
    return { forwardDir, startCells, promotionCells, captureDirections, doubleStep: true }
  }

  function init(pluginConfig, { request }) {
    topology = request('core.topology')
    const setupInput = pluginConfig.setup || config.setup

    let board
    if (typeof setupInput === 'object' && !Array.isArray(setupInput)) {
      board = setupInput
    } else if (topology && topology.parsePosition) {
      board = topology.parsePosition(setupInput, vocabulary)
    } else {
      board = parseFENtoArray(setupInput)
    }

    pawnConfig = derivePawnConfig(topology)

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

  function getCell(board, pos) {
    if (Array.isArray(board)) return board[pos]
    return board[pos] || null
  }

  function setCell(board, pos, value) {
    board[pos] = value
  }

  function cloneBoard(board) {
    if (Array.isArray(board)) return [...board]
    return { ...board }
  }

  function allPositions() {
    if (topology && topology.getAllCells) return topology.getAllCells()
    const size = topology ? topology.rows * topology.cols : 64
    const result = []
    for (let i = 0; i < size; i++) result.push(i)
    return result
  }

  function buildViewBoard(board, playerIdx) {
    if (Array.isArray(board)) {
      return board.map(cell => {
        if (cell === null) return null
        return { friendly: cell.owner === playerIdx, enemy: cell.owner !== playerIdx, ...cell }
      })
    }
    const view = {}
    for (const pos of allPositions()) {
      const cell = board[pos] || null
      if (cell === null) {
        view[pos] = null
      } else {
        view[pos] = { friendly: cell.owner === playerIdx, enemy: cell.owner !== playerIdx, ...cell }
      }
    }
    return view
  }

  function generateMovesForPiece(from, slice, playerIdx) {
    const piece = getCell(slice.board, from)
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
    if (!pawnConfig) return []
    const moves = []
    const { forwardDir, startCells, promotionCells, captureDirections, doubleStep } = pawnConfig

    const fwd = forwardDir[playerIdx]
    const forward = topology.step(from, fwd)
    if (forward !== null && getCell(slice.board, forward) === null) {
      if (promotionCells[playerIdx].has(forward)) {
        for (const promo of config.promotionChoices) {
          moves.push({ from, to: forward, promotion: promo })
        }
      } else {
        moves.push({ from, to: forward })
      }

      if (doubleStep && startCells[playerIdx].has(from)) {
        const doubleForward = topology.step(forward, fwd)
        if (doubleForward !== null && getCell(slice.board, doubleForward) === null) {
          moves.push({ from, to: doubleForward })
        }
      }
    }

    const capDirs = captureDirections[playerIdx]
    for (const capDir of capDirs) {
      const target = topology.step(from, capDir)
      if (target === null) continue

      const targetPiece = getCell(slice.board, target)
      if (targetPiece !== null && targetPiece.owner !== playerIdx) {
        if (promotionCells[playerIdx].has(target)) {
          for (const promo of config.promotionChoices) {
            moves.push({ from, to: target, capture: true, promotion: promo })
          }
        } else {
          moves.push({ from, to: target, capture: true })
        }
      }

      if (config.enPassant && target === slice.enPassantTarget) {
        const capturedPawn = topology.step(target, forwardDir[1 - playerIdx])
        moves.push({ from, to: target, capture: true, enPassant: true, captured: capturedPawn })
      }
    }

    return moves
  }

  function generateCastlingMoves(kingFrom, slice, playerIdx) {
    if (!config.castling || !slice.castlingRights) return []
    const rights = slice.castlingRights[playerIdx]
    if (!rights || (!rights.king && !rights.queen)) return []
    if (!topology || topology.cols === undefined) return []

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
        const piece = getCell(board, idx)
        if (piece && piece.type === rookType && piece.owner === owner) return idx
      }
    } else {
      for (let c = 0; c < kingCol; c++) {
        const idx = kingRow * cols + c
        const piece = getCell(board, idx)
        if (piece && piece.type === rookType && piece.owner === owner) return idx
      }
    }
    return -1
  }

  function canCastle(slice, playerIdx, kingFrom, kingDest, rookFrom, rookDest) {
    const board = slice.board
    if (!getCell(board, rookFrom)) return false

    const minSq = Math.min(kingFrom, kingDest, rookFrom, rookDest)
    const maxSq = Math.max(kingFrom, kingDest, rookFrom, rookDest)
    for (let sq = minSq; sq <= maxSq; sq++) {
      if (sq === kingFrom || sq === rookFrom) continue
      if (getCell(board, sq) !== null) return false
    }

    const step = kingDest > kingFrom ? 1 : -1
    for (let sq = kingFrom; sq !== kingDest + step; sq += step) {
      if (isSquareAttacked(board, sq, playerIdx)) return false
    }

    return true
  }

  function isSquareAttacked(board, target, defendingPlayer) {
    const attacker = 1 - defendingPlayer
    for (const pos of allPositions()) {
      const piece = getCell(board, pos)
      if (!piece || piece.owner !== attacker) continue
      if (pieceAttacks(pos, target, piece, board)) return true
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

    const viewBoard = buildViewBoard(board, piece.owner)
    return primitive.attacks(topology, from, target, viewBoard)
  }

  function pawnAttacks(from, target, owner) {
    if (!pawnConfig) return false
    const capDirs = pawnConfig.captureDirections[owner]
    for (const capDir of capDirs) {
      const t = topology.step(from, capDir)
      if (t === target) return true
    }
    return false
  }

  function isInCheck(board, playerIdx) {
    const royalType = config.royalType || 'king'
    let kingPos = null
    for (const pos of allPositions()) {
      const cell = getCell(board, pos)
      if (cell && cell.type === royalType && cell.owner === playerIdx) {
        kingPos = pos
        break
      }
    }
    if (kingPos === null) return true
    return isSquareAttacked(board, kingPos, playerIdx)
  }

  function validateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const piece = getCell(slice.board, move.from)
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
    const board = cloneBoard(slice.board)
    const piece = getCell(board, move.from)
    let castlingRights = slice.castlingRights ? deepCopyCastling(slice.castlingRights) : null
    let enPassantTarget = null
    let halfmoveClock = slice.halfmoveClock + 1

    if (getCell(board, move.to) !== null || piece.type === (config.pawnType || 'pawn')) {
      halfmoveClock = 0
    }

    if (move.castle) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      setCell(board, move.rookTo, getCell(board, move.rookFrom))
      setCell(board, move.rookFrom, null)
      if (castlingRights) {
        castlingRights[playerIdx] = { king: false, queen: false }
      }
    } else if (move.enPassant) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }

    if (move.promotion) {
      setCell(board, move.to, { type: move.promotion, owner: playerIdx })
    }

    if (config.enPassant && piece.type === (config.pawnType || 'pawn') && pawnConfig) {
      const fwd = pawnConfig.forwardDir[playerIdx]
      const oneStep = topology.step(move.from, fwd)
      const twoStep = oneStep !== null ? topology.step(oneStep, fwd) : null
      if (twoStep === move.to) {
        enPassantTarget = oneStep
      }
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
      const capturedPiece = slice.board[move.to]
      if (capturedPiece && capturedPiece.type === rookType) {
        updateRookCastling(move.to, capturedPiece.owner, castlingRights)
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
    if (!topology || topology.cols === undefined) return
    const cols = topology.cols
    const advDir = config.advancement || { 0: -1, 1: 1 }
    const advancement = typeof advDir === 'function' ? advDir(owner) : advDir[owner]
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

    for (const pos of allPositions()) {
      const piece = getCell(slice.board, pos)
      if (!piece || piece.owner !== playerIdx) continue
      const moves = generateMovesForPiece(pos, slice, playerIdx)
      allMoves.push(...moves)

      if (piece.type === (config.royalType || 'king')) {
        allMoves.push(...generateCastlingMoves(pos, slice, playerIdx))
      }
    }

    return filterLegalMoves(allMoves, slice, playerIdx)
  }

  function filterLegalMoves(moves, slice, playerIdx) {
    return moves.filter(move => {
      const testBoard = cloneBoard(slice.board)
      if (move.castle) {
        setCell(testBoard, move.to, getCell(testBoard, move.from))
        setCell(testBoard, move.from, null)
        setCell(testBoard, move.rookTo, getCell(testBoard, move.rookFrom))
        setCell(testBoard, move.rookFrom, null)
      } else if (move.enPassant) {
        setCell(testBoard, move.to, getCell(testBoard, move.from))
        setCell(testBoard, move.from, null)
        setCell(testBoard, move.captured, null)
      } else {
        setCell(testBoard, move.to, getCell(testBoard, move.from))
        setCell(testBoard, move.from, null)
      }
      if (move.promotion) {
        setCell(testBoard, move.to, { type: move.promotion, owner: playerIdx })
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
