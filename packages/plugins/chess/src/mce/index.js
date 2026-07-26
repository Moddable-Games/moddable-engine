import MCE from './engine.js'
import './pieces/index.js'
import './rules/index.js'
import { getVariantStatus, variantLegalMoves } from './variants-util.js'
import './variants/index.js'
import { pseudoLegalMoves, legalMoves, inCheck, isAttacked } from './moves.js'
import { makeMove, unmakeMove, getStatus } from './play.js'
import { aiPickMove, aiPickDuckSquare, AI_DIFFICULTIES, loadOpeningBook } from './ai.js'
import { createGameController } from './controller.js'

export {
  MCE,
  pseudoLegalMoves,
  legalMoves,
  inCheck,
  isAttacked,
  makeMove,
  unmakeMove,
  getStatus,
  getVariantStatus,
  variantLegalMoves,
  aiPickMove,
  aiPickDuckSquare,
  AI_DIFFICULTIES,
  loadOpeningBook,
  createGameController,
}
export default MCE
