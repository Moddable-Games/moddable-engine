import MCE, {
  legalMoves, inCheck, makeMove, unmakeMove, getStatus,
  aiPickMove, AI_DIFFICULTIES
} from './mce/index.js'

export function createChessPlugin(variantConfig = {}) {
  const variantKey = variantConfig.variant || 'standard'

  function init(pluginConfig) {
    const fen = pluginConfig.fen || variantConfig.fen || null
    const game = MCE.createGame(variantKey)
    if (fen) MCE.loadFEN(game, fen)
    return { game }
  }

  function getLegalMoves(slice, full) {
    const g = slice.game
    return legalMoves(g)
  }

  function validateMove(move, slice, full) {
    const legal = getLegalMoves(slice, full)
    return legal.some(m => m.from === move.from && m.to === move.to &&
      (move.promotion === undefined || m.promotion === move.promotion) &&
      (move.flag === undefined || m.flag === move.flag))
  }

  function applyMove(move, slice, full) {
    const g = cloneGame(slice.game)
    const undo = makeMove(g, move)
    if (!undo) return slice
    return { game: g }
  }

  function checkWin(slice, full) {
    const g = slice.game
    const status = getStatus(g)
    if (status === 'checkmate') {
      return g.turn === MCE.WHITE ? 'black' : 'white'
    }
    if (status === 'stalemate' || status === 'draw-repetition' ||
        status === 'draw-material' || status === 'draw-50') {
      return 'draw'
    }
    return null
  }

  function getBoard(slice) {
    return slice.game.board
  }

  function getCurrentPlayer(slice) {
    return slice.game.turn === MCE.WHITE ? 0 : 1
  }

  function getFEN(slice) {
    return MCE.toFEN(slice.game)
  }

  function getAIMove(slice, opts = {}) {
    const g = slice.game
    const difficulty = opts.difficulty || 'medium'
    return aiPickMove(g, { difficulty })
  }

  function cloneGame(g) {
    const clone = MCE.createGame({ variant: g.variant || variantKey })
    MCE.loadFEN(clone, MCE.toFEN(g))
    clone.positionHistory = [...(g.positionHistory || [])]
    if (g.checkCount) clone.checkCount = { ...g.checkCount }
    if (g.hand) clone.hand = JSON.parse(JSON.stringify(g.hand))
    if (g.effects) clone.effects = g.effects.map(e => ({ ...e }))
    if (g.duckSq !== undefined) clone.duckSq = g.duckSq
    if (g.movesThisTurn !== undefined) clone.movesThisTurn = g.movesThisTurn
    return clone
  }

  function boardToEngineFormat(slice, vocabulary) {
    const g = slice.game
    const board = new Array(g.rows * g.cols).fill(null)
    for (let i = 0; i < g.board.length; i++) {
      const p = g.board[i]
      if (p === null) continue
      const color = MCE.pieceColor(p)
      const type = MCE.pieceType(p)
      const owner = color === MCE.WHITE ? 0 : 1
      board[i] = { type, owner }
    }
    return board
  }

  return {
    sliceName: 'chess',
    variant: variantKey,
    config: variantConfig,

    init,
    validateMove,
    applyMove,
    getLegalMoves,
    checkWin,

    getBoard,
    getCurrentPlayer,
    getFEN,
    getAIMove,
    boardToEngineFormat,
    cloneGame,

    get MCE() { return MCE },
    get variantRegistry() { return MCE.variantRegistry },
    get AI_DIFFICULTIES() { return AI_DIFFICULTIES },
  }
}

export { MCE, AI_DIFFICULTIES }
