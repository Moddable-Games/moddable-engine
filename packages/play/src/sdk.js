import { createGameForFamily, getFamilies, hasFamily, defaultPlayersFor, defaultTopologyFor } from './play.js'
import { createSimulatorForFamily } from './simulator-helper.js'
import { renderStateAsSvg } from './render-helper.js'
import {
  listVariants as listRegisteredVariants,
  getVariantConfig,
  getVariantGroups,
  hasVariant,
} from './variant-registry.js'
import { createMinimax, DIFFICULTIES } from '../../ai/src/minimax.js'
import { createMCTS, MCTS_DIFFICULTIES } from '../../ai/src/mcts.js'
import { EVALUATORS } from '../../ai/src/evaluators.js'
import { interactionModelFor, FAMILY_INTERACTION } from './interaction.js'
import { definitionFromVariant } from './variant-definition.js'

const MCTS_FAMILIES = new Set(['go', 'hex'])

export { getFamilies, hasFamily, getVariantGroups, hasVariant, getVariantConfig }
export { DIFFICULTIES as AI_DIFFICULTIES }

export function listVariants(family, group) {
  const registered = listRegisteredVariants(family, group)
  if (registered.length > 0) return registered
  return []
}

export function createGame(family, variant, opts = {}) {
  if (!hasFamily(family)) {
    throw new Error(`Unknown game family: "${family}". Available: ${getFamilies().join(', ')}`)
  }
  const config = variant ? getVariantConfig(family, variant) : null
  return createGameForFamily(family, {
    variant,
    definition: opts.definition || (config && config.definition) || undefined,
    rngSeed: opts.rngSeed,
  })
}

export function getLegalMoves(family, variant, state, opts = {}) {
  const game = createGame(family, variant, opts)
  if (state) game.loadState(state)
  return game.getLegalMoves()
}

export function getGameStatus(family, variant, state, opts = {}) {
  const game = createGame(family, variant, opts)
  if (state) game.loadState(state)

  const outcome = game.checkWin()
  if (outcome !== null && outcome !== undefined && outcome !== 'active') {
    return { status: String(outcome), gameOver: outcome !== 'scoring', family, variant: variant || null }
  }

  const moves = game.getLegalMoves()
  return {
    status: 'active',
    gameOver: false,
    family,
    variant: variant || null,
    turn: game.currentPlayer(),
    legalMoveCount: moves.length,
  }
}

export function createAI(family, variant, opts = {}) {
  const difficulty = opts.difficulty || 'medium'
  const useMcts = opts.search === 'mcts' || (!opts.search && MCTS_FAMILIES.has(family))

  const simulator = createSimulatorForFamily(family, opts.state || null, {
    variant,
    definition: opts.definition || searchDefinition(family, variant),
    rngSeed: opts.rngSeed,
    evaluate: opts.evaluate || variantEvaluator(family, variant),
  })

  const engine = useMcts
    ? createMCTS(simulator, { difficulty, ...opts.searchOpts })
    : createMinimax(simulator, {
        difficulty,
        openingBook: variantOpeningBook(family, variant),
        ...opts.searchOpts,
      })

  return {
    search: useMcts ? 'mcts' : 'minimax',
    difficulty,
    simulator,
    pickMove(sliceState, playerIndex) {
      return engine.search(sliceState, playerIndex)
    },
  }
}

export function analyzePosition(family, variant, state, opts = {}) {
  const ai = createAI(family, variant, { ...opts, state, difficulty: opts.difficulty || 'expert' })
  const game = createGame(family, variant, opts)
  if (state) game.loadState(state)

  const playerIndex = playerIndexOf(game)
  const slice = state && state.slice ? state.slice : game.getState().slice
  const move = ai.pickMove(slice, playerIndex)
  if (!move) return { bestMove: null, evaluation: 0, search: ai.search }
  return {
    bestMove: move,
    evaluation: move.score !== undefined ? move.score : 0,
    search: ai.search,
  }
}

export function renderSvg(family, variant, state, opts = {}) {
  return renderStateAsSvg(family, state, { ...opts, variant })
}

export function getInteractionModel(family) {
  return {
    family,
    model: FAMILY_INTERACTION[family] || 'move',
    needsSelection: interactionModelFor(family).needsSelection,
  }
}

export { MCTS_DIFFICULTIES }

// Search needs a terminal position to resolve to a concrete winner. Go's
// checkWin deliberately reports 'scoring' after two passes so the interface can
// run a dead-stone marking phase, which a rollout cannot do, so the simulated
// copy of the game is told to settle the score itself.
function searchDefinition(family, variant) {
  if (!variant || !hasVariant(family, variant)) return undefined
  const config = getVariantConfig(family, variant)
  if (!config || config.autoScore !== undefined) return undefined
  if (config.scoring !== 'territory' && config.scoring !== 'area') return undefined
  return definitionFromVariant(family, { ...config, autoScore: true }, {
    players: defaultPlayersFor(family),
    topology: defaultTopologyFor(family) || {},
  })
}

function variantEvaluator(family, variant) {
  const config = variant ? getVariantConfig(family, variant) : null
  if (!config || !config.evaluate) return undefined
  const baseEval = EVALUATORS[family] || null
  const variantEval = config.evaluate
  return (state, playerIndex) => {
    const ctx = { currentPlayer: playerIndex, config }
    const bonus = variantEval(state, ctx) || 0
    const base = baseEval ? baseEval(state, playerIndex) : 0
    return base + bonus
  }
}

function variantOpeningBook(family, variant) {
  const config = variant ? getVariantConfig(family, variant) : null
  return (config && config.openingBook) || undefined
}

function playerIndexOf(game) {
  const state = game.getState()
  const players = state.players
  if (players && typeof players.currentIndex === 'number') return players.currentIndex
  return 0
}
