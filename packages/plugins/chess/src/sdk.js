import MCE, {
  legalMoves, inCheck, isAttacked, makeMove, unmakeMove, getStatus,
  getVariantStatus, variantLegalMoves,
  aiPickMove, aiPickDuckSquare, AI_DIFFICULTIES,
  createGameController,
} from './mce/index.js'
import { renderFromEngine } from '../../../render/src/render-engine.js'

export function listVariants(group) {
  const registry = MCE.variantRegistry
  const results = []
  for (const [key, vc] of Object.entries(registry)) {
    if (key === 'piece-test') continue
    if (group && vc.group !== group) continue
    results.push({
      key,
      label: vc.label || vc.name || key,
      group: vc.group || 'Other',
      board: (vc.cols || 8) + '×' + (vc.rows || 8),
      description: vc.description || '',
      rule: vc.rule || '',
    })
  }
  return results
}

export function createGame(variant = 'standard', fen) {
  const game = MCE.createGame(variant)
  if (fen) MCE.loadFEN(game, fen)
  return game
}

export function getLegalMoves(variant = 'standard', fen) {
  const game = MCE.createGame(variant)
  if (fen) MCE.loadFEN(game, fen)
  const vc = MCE.getVariantConfig(variant)
  const moves = (vc && vc.moveFilter) ? variantLegalMoves(game) : legalMoves(game)
  return moves.map(m => ({
    from: algebraicFromIdx(m.from, game.rows, game.cols),
    to: algebraicFromIdx(m.to, game.rows, game.cols),
    fromIdx: m.from,
    toIdx: m.to,
    flag: m.flag || null,
    promotion: m.promo || null,
    capture: game.board[m.to] !== null || m.flag === 'ep',
  }))
}

export function analyzePosition(variant = 'standard', fen, depth = 3) {
  const game = MCE.createGame(variant)
  if (fen) MCE.loadFEN(game, fen)
  const move = aiPickMove(game, { difficulty: 'expert', depth })
  if (!move) return { evaluation: 0, bestMove: null }
  return {
    bestMove: algebraicFromIdx(move.from, game.rows, game.cols) + algebraicFromIdx(move.to, game.rows, game.cols),
    evaluation: move.score || 0,
  }
}

export function getGameStatus(variant = 'standard', fen) {
  const game = MCE.createGame(variant)
  if (fen) MCE.loadFEN(game, fen)
  const variantStatus = getVariantStatus(game)
  if (variantStatus) return { status: variantStatus, gameOver: true }
  const status = getStatus(game)
  if (status === 'checkmate' || status === 'stalemate' || status?.startsWith('draw')) {
    return { status, gameOver: true }
  }
  return {
    status: 'active',
    gameOver: false,
    turn: game.turn === MCE.WHITE ? 'white' : 'black',
    inCheck: inCheck(game, game.turn),
  }
}

export function toFEN(game) {
  return MCE.toFEN(game)
}

export function loadFEN(game, fen) {
  MCE.loadFEN(game, fen)
  return game
}

export function renderSvg(variant = 'standard', fen, opts = {}) {
  const game = MCE.createGame(variant)
  if (fen) MCE.loadFEN(game, fen)
  const rows = game.rows
  const cols = game.cols

  const boardFen = fen || MCE.toFEN(game).split(' ')[0]
  const resolved = {
    topology: { type: 'grid', rows, cols, tileMode: 'tiles' },
    render: {
      cellColor: 'checkered',
      alternating: true,
      labels: opts.labels !== false,
      interactive: !!opts.interactive,
    },
    setup: boardFen,
    pieces: { set: opts.pieceSet || 'mce-fairy-complete' },
    meta: { label: '' },
  }

  const svg = renderFromEngine(resolved, opts.renderOpts || {})
  return { svg, rows, cols }
}

function algebraicFromIdx(idx, rows, cols) {
  const r = Math.floor(idx / cols)
  const c = idx % cols
  const file = String.fromCharCode(97 + c)
  const rank = rows - r
  return file + rank
}

export {
  MCE,
  createGameController,
  aiPickMove,
  AI_DIFFICULTIES,
  makeMove,
  unmakeMove,
  legalMoves,
  inCheck,
  isAttacked,
  getStatus,
  getVariantStatus,
  variantLegalMoves,
}
