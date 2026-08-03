import { rider, leaper, compose, divergent, fromConfig, OFFSETS } from '../../../piece-behaviour/index.js'

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

  const _symbolsSeen = new Map()
  for (const [type, def] of Object.entries(vocabulary)) {
    if (!def.symbols) continue
    for (const [owner, symbol] of Object.entries(def.symbols)) {
      const existing = _symbolsSeen.get(symbol)
      if (existing) {
        throw new Error(`Vocabulary symbol collision: "${symbol}" claimed by both ${existing} and ${type} (owner ${owner})`)
      }
      _symbolsSeen.set(symbol, type)
    }
  }

  const builtPieces = new Map()

  function buildPiece(name) {
    if (builtPieces.has(name)) return builtPieces.get(name)
    const pConfig = pieceConfigs[name]
    if (!pConfig || pConfig.movement === 'pawn') {
      builtPieces.set(name, null)
      return null
    }
    if (pConfig.type === 'compose' && Array.isArray(pConfig.parts)) {
      const parts = pConfig.parts.map(p => typeof p === 'string' ? buildPiece(p) : fromConfig(p)).filter(Boolean)
      const composed = compose(...parts)
      builtPieces.set(name, composed)
      return composed
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
      const defaultStart = dir === -1 ? rows - 2 : 1
      const startRow = config.pawnStartRow ? config.pawnStartRow[player] : defaultStart
      const promoRow = dir === -1 ? 0 : rows - 1
      for (let c = 0; c < cols; c++) {
        startCells[player].add(topo.toIndex(startRow, c))
        promotionCells[player].add(topo.toIndex(promoRow, c))
      }
      captureDirections[player] = [[dir, -1], [dir, 1]]
    }
    return { forwardDir, startCells, promotionCells, captureDirections, doubleStep: config.doubleStep !== false }
  }

  function init(pluginConfig, { request }) {
    topology = request('core.topology')
    const rng = request('core.rng')
    const rawSetup = pluginConfig.setup || config.setup
    const setupInput = typeof rawSetup === 'function' ? rawSetup(rng) : rawSetup

    let board
    if (Array.isArray(setupInput)) {
      board = setupInput
    } else if (typeof setupInput === 'object') {
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
    if (config.drops) {
      state.hands = [[], []]
    }
    if (config.placementPieces) {
      state._phase = 'placement'
      state._toPlace = [config.placementPieces[0].slice(), config.placementPieces[1].slice()]
    }

    if (config.initState) {
      config.initState(state)
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
    if (Array.isArray(board)) return board.map(c => c ? { ...c } : null)
    const clone = {}
    for (const k of Object.keys(board)) clone[k] = board[k] ? { ...board[k] } : null
    return clone
  }

  function applyMoveToBoard(board, move) {
    if (move.castle) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      setCell(board, move.rookTo, getCell(board, move.rookFrom))
      setCell(board, move.rookFrom, null)
    } else if (move.enPassant) {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
      setCell(board, move.captured, null)
    } else {
      setCell(board, move.to, getCell(board, move.from))
      setCell(board, move.from, null)
    }
    if (move.promotion) {
      setCell(board, move.to, { type: move.promotion, owner: getCell(board, move.to)?.owner ?? 0 })
    }
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

    let primitive = buildPiece(piece.type)
    if (!primitive) return []

    if (pConfig.directional && playerIdx === 1) {
      primitive = fromConfig({ ...pConfig, offsets: pConfig.offsets.map(([dr, dc]) => [-dr, dc]) })
    }

    const viewBoard = buildViewBoard(slice.board, playerIdx)
    return primitive.genMoves(topology, from, viewBoard)
  }

  function generatePawnMoves(from, slice, playerIdx) {
    if (!pawnConfig) return []
    const moves = []
    const { forwardDir, startCells, promotionCells, captureDirections, doubleStep } = pawnConfig
    const moveDirections = pawnConfig.moveDirections

    if (moveDirections) {
      for (const dir of moveDirections[playerIdx]) {
        const target = topology.step(from, dir)
        if (target === null) continue
        if (getCell(slice.board, target) !== null) continue
        if (promotionCells[playerIdx].has(target)) {
          for (const promo of config.promotionChoices) {
            moves.push({ from, to: target, promotion: promo })
          }
        } else {
          moves.push({ from, to: target })
        }
      }
      const canDoubleStep = config.torpedo
        ? doubleStep
        : doubleStep && startCells[playerIdx].has(from)
      if (canDoubleStep) {
        for (const dir of moveDirections[playerIdx]) {
          const step1 = topology.step(from, dir)
          if (step1 === null || getCell(slice.board, step1) !== null) continue
          const step2 = topology.step(step1, dir)
          if (step2 !== null && getCell(slice.board, step2) === null) {
            moves.push({ from, to: step2 })
          }
        }
      }
    } else {
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

        const canDoubleStep = config.torpedo
          ? doubleStep
          : doubleStep && startCells[playerIdx].has(from)
        if (canDoubleStep) {
          const doubleForward = topology.step(forward, fwd)
          if (doubleForward !== null && getCell(slice.board, doubleForward) === null) {
            moves.push({ from, to: doubleForward })
          }
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

    let primitive = buildPiece(piece.type)
    if (!primitive) return false

    if (pConfig.directional && piece.owner === 1) {
      primitive = fromConfig({ ...pConfig, offsets: pConfig.offsets.map(([dr, dc]) => [-dr, dc]) })
    }

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
    if (kingPos === null) return false
    return isSquareAttacked(board, kingPos, playerIdx)
  }

  const actions = config.actions || {}

  function validateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    if (move.action && actions[move.action]) {
      const legal = getLegalMoves(slice, full)
      return legal.some(m =>
        m.action === move.action && m.to === move.to &&
        (move.from === undefined || m.from === move.from) &&
        (move.type === undefined || m.type === move.type)
      )
    }
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
    const hands = config.drops ? [slice.hands[0].slice(), slice.hands[1].slice()] : null

    if (move.action && actions[move.action]) {
      const actionDef = actions[move.action]
      const ctx = { board, slice, playerIdx, hands, topology, getCell, setCell, allPositions }
      const result = actionDef.apply(move, ctx)
      const newSlice = { board: result.board || board, halfmoveClock: result.halfmoveClock ?? 0, fullmoveNumber: result.fullmoveNumber ?? slice.fullmoveNumber }
      if (result.hands !== undefined) newSlice.hands = result.hands
      else if (hands) newSlice.hands = hands
      if (slice.castlingRights) newSlice.castlingRights = result.castlingRights || deepCopyCastling(slice.castlingRights)
      if (config.enPassant) newSlice.enPassantTarget = result.enPassantTarget ?? null
      for (const k of Object.keys(slice)) {
        if (k.startsWith('_') && !(k in newSlice)) newSlice[k] = slice[k]
      }
      if (result.sliceKeys) Object.assign(newSlice, result.sliceKeys)
      const continueTurn = actionDef.continuesTurn === true || (typeof actionDef.continuesTurn === 'function' && actionDef.continuesTurn(newSlice))
      return { state: newSlice, continueTurn }
    }

    const piece = getCell(board, move.from)
    let castlingRights = slice.castlingRights ? deepCopyCastling(slice.castlingRights) : null
    let enPassantTarget = null
    let halfmoveClock = slice.halfmoveClock + 1

    if (getCell(board, move.to) !== null || piece.type === (config.pawnType || 'pawn')) {
      halfmoveClock = 0
    }

    if (hands) {
      const captured = move.enPassant ? getCell(slice.board, move.captured) : getCell(slice.board, move.to)
      if (captured && captured.owner !== playerIdx && captured.type !== (config.royalType || 'king')) {
        const handType = captured.wasPromoted ? (config.pawnType || 'pawn') : captured.type
        hands[playerIdx].push(handType)
      }
    }

    if (config.moveApply) {
      config.moveApply({ move, board, piece, playerIdx, topology, setCell, getCell })
    } else if (move.castle) {
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
      setCell(board, move.to, { type: move.promotion, owner: playerIdx, wasPromoted: config.drops || undefined })
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
    if (hands) newSlice.hands = hands
    for (const k of Object.keys(slice)) {
      if (k.startsWith('_') && !(k in newSlice)) newSlice[k] = slice[k]
    }

    let effects = slice.effects ? slice.effects.map(e => ({ ...e })) : []
    if (config.afterMove) {
      const captured = move.enPassant ? slice.board[move.captured] : slice.board[move.to]
      const ctx = { playerIdx, move, captured, board, effects, topology }
      ctx.addEffect = (effect) => effects.push(effect)
      ctx.hasEffect = (sq, type) => effects.some(e => e.sq === sq && e.type === type)
      ctx.removeEffect = (sq, type) => { effects = effects.filter(e => !(e.sq === sq && e.type === type)) }
      config.afterMove(ctx)
    }
    effects = effects.filter(e => {
      if (e.duration === undefined || e.duration === null) return true
      e.duration--
      return e.duration > 0
    })
    if (effects.length > 0 || slice.effects) newSlice.effects = effects

    if (config.turnLogic) {
      const opponent = 1 - playerIdx
      const inCheck = isInCheck(board, opponent)
      const movesThisTurn = (slice._movesThisTurn || 0) + 1
      const ctx = { movesThisTurn, inCheck, playerIdx, fullmoveNumber, config, slice: newSlice }
      const shouldContinue = config.turnLogic(ctx)
      if (shouldContinue) {
        newSlice._movesThisTurn = movesThisTurn
        return { state: newSlice, continueTurn: true }
      }
      newSlice._movesThisTurn = 0
      if (config.onTurnEnd) config.onTurnEnd(newSlice)
    }

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

    for (const [name, actionDef] of Object.entries(actions)) {
      if (actionDef.generate) {
        const ctx = { topology, allPositions, getCell, pawnConfig, slice, config, normalMoves: allMoves }
        const actionMoves = actionDef.generate(slice, playerIdx, ctx)
        allMoves.push(...actionMoves)
      }
    }

    let legal = config.noCheck
      ? allMoves
      : filterLegalMoves(allMoves, slice, playerIdx)

    if (config.moveFilter) {
      legal = config.moveFilter(legal, slice, {
        currentPlayer: playerIdx,
        config,
        isInCheck: () => isInCheck(slice.board, playerIdx),
        givesCheck: (move) => {
          const testBoard = cloneBoard(slice.board)
          applyMoveToBoard(testBoard, move)
          return isInCheck(testBoard, 1 - playerIdx)
        },
      })
    }

    return legal
  }

  function filterLegalMoves(moves, slice, playerIdx) {
    return moves.filter(move => {
      if (move.action && actions[move.action] && actions[move.action].skipsCheckFilter) return true
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

    if (config.winCondition) {
      const result = config.winCondition(slice, { currentPlayer: playerIdx, config })
      if (result !== null && result !== undefined) return result
    }

    const oppFull = { ...full, __players: { ...full.__players, currentIndex: opponent } }
    const oppMoves = getLegalMoves(slice, oppFull)

    if (oppMoves.length === 0) {
      if (config.noCheck) {
        if (config.stalemateMeaning === 'win') return opponent === 0 ? 'white' : 'black'
        if (config.stalemateMeaning === 'loss') return playerIdx === 0 ? 'white' : 'black'
        return 'draw'
      }
      if (isInCheck(slice.board, opponent)) {
        return playerIdx === 0 ? 'white' : 'black'
      }
      if (config.stalemateMeaning === 'win' || config.stalemateMeaning === 'loss') {
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

  function getVisibility(slice, full, viewerIndex) {
    if (!config.visibility) return null
    return config.visibility(slice, viewerIndex, { topology, generateMovesForPiece, allPositions, getCell })
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
    getVisibility,
  }
}
