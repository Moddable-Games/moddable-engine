const models = new Map()

export function registerInteractionModel(name, model) {
  models.set(name, model)
}

export function getInteractionModel(name) {
  return models.get(name) || models.get('move')
}

export function listInteractionModels() {
  return [...models.keys()]
}

function sameCell(a, b) {
  return a !== null && a !== undefined && String(a) === String(b)
}

function isBoardMove(move) {
  return move && move.from !== undefined && move.to !== undefined
}

const moveModel = {
  name: 'move',
  needsSelection: true,

  targetsFor(pos, moves) {
    return moves.filter(m => sameCell(m.from, pos))
  },

  handleClick(pos, ctx) {
    const { selected, moves, getOwnerAt, playerIndex } = ctx

    if (selected !== null && selected !== undefined) {
      const candidates = moves.filter(m => sameCell(m.from, selected) && sameCell(m.to, pos))
      if (candidates.length > 1) {
        const choiceKey = candidates[0].promotion !== undefined ? 'promotion' : null
        if (choiceKey) {
          const choices = [...new Set(candidates.map(m => m[choiceKey]))]
          return { type: 'choice', choiceKey, choices, candidates }
        }
        return { type: 'move', move: candidates[0] }
      }
      if (candidates.length === 1) {
        return { type: 'move', move: candidates[0] }
      }
    }

    const owner = getOwnerAt(pos)
    if (owner !== null && owner === playerIndex && moves.some(m => sameCell(m.from, pos))) {
      return { type: 'select', pos }
    }
    return { type: 'deselect' }
  },
}

const placeModel = {
  name: 'place',
  needsSelection: false,

  targetsFor() {
    return []
  },

  handleClick(pos, ctx) {
    const { moves } = ctx
    const candidates = moves.filter(m => sameCell(m.coord, pos) || (!isBoardMove(m) && sameCell(m.to, pos)))
    if (candidates.length === 1) return { type: 'move', move: candidates[0] }
    if (candidates.length > 1) return { type: 'move', move: candidates[0] }
    return { type: 'reject', reason: 'illegal' }
  },
}

const chainModel = {
  name: 'chain',
  needsSelection: true,

  targetsFor(pos, moves) {
    return moves.filter(m => sameCell(m.from, pos))
  },

  handleClick(pos, ctx) {
    const { selected, moves, getOwnerAt, playerIndex, chainAnchor } = ctx

    if (chainAnchor !== null && chainAnchor !== undefined) {
      const continuations = moves.filter(m => sameCell(m.from, chainAnchor) && sameCell(m.to, pos))
      if (continuations.length > 0) {
        return { type: 'move', move: continuations[0], continuesChain: true }
      }
      return { type: 'reject', reason: 'must-continue-chain' }
    }

    return moveModel.handleClick(pos, ctx)
  },
}

const dropModel = {
  name: 'drop',
  needsSelection: true,

  targetsFor(pos, moves) {
    return moves.filter(m => sameCell(m.from, pos))
  },

  handleClick(pos, ctx) {
    const { dropType, moves } = ctx

    if (dropType) {
      const drops = moves.filter(m => m.drop === dropType && sameCell(m.to, pos))
      if (drops.length > 0) return { type: 'move', move: drops[0], clearsDrop: true }
      return { type: 'reject', reason: 'illegal-drop', clearsDrop: true }
    }

    return moveModel.handleClick(pos, ctx)
  },

  handleHandClick(pieceType, ctx) {
    const { moves } = ctx
    const available = moves.some(m => m.drop === pieceType)
    if (!available) return { type: 'reject', reason: 'no-drops' }
    return { type: 'arm-drop', dropType: pieceType }
  },
}

registerInteractionModel('move', moveModel)
registerInteractionModel('place', placeModel)
registerInteractionModel('chain', chainModel)
registerInteractionModel('drop', dropModel)

export const FAMILY_INTERACTION = {
  backgammon: 'move',
  big2: 'place',
  chess: 'drop',
  draughts: 'chain',
  go: 'place',
  halma: 'move',
  hex: 'place',
  mancala: 'place',
  morris: 'place',
  race: 'move',
  reversi: 'place',
  shogi: 'drop',
  xiangqi: 'move',
}

export function interactionModelFor(family, override) {
  if (override) return getInteractionModel(override)
  return getInteractionModel(FAMILY_INTERACTION[family] || 'move')
}

export const ACTION_MOVES = {
  pass: (moves) => moves.find(m => m.action === 'pass') || null,
  resign: () => ({ action: 'resign' }),
}

export function availableActions(moves) {
  const actions = []
  if (moves.some(m => m.action === 'pass')) actions.push('pass')
  actions.push('resign')
  return actions
}
