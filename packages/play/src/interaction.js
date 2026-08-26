const models = new Map()
const familyInteractions = new Map()

export function registerInteractionModel(name, model) {
  models.set(name, model)
}

export function registerFamilyInteraction(family, interactionName) {
  familyInteractions.set(family, interactionName)
}

// Strict. This used to fall back to the move model for any name it did not
// recognise, so mancala's `interaction = 'select'` - a model nobody had
// registered - silently became the move model, which wants a from and a to.
// A sowing game has neither, so every click on every pit did nothing at all,
// and no warning fired because a name HAD been declared. It just pointed at
// nothing. Callers that want a default ask for one.
export function getInteractionModel(name) {
  return models.get(name) || null
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


// One click is the whole move. A sowing game has no from-and-to: you choose a
// pit and its seeds go round. Mancala declared `interaction = 'select'` and no
// model of that name existed, so `interactionModelFor` returned undefined, the
// controller had no model to consult, and not one click on the board did
// anything at all.
const selectModel = {
  name: 'select',
  needsSelection: false,

  targetsFor(pos, moves) {
    return moves.filter(m => sameCell(m.to, pos) || sameCell(m.coord, pos))
  },

  handleClick(pos, ctx) {
    const { moves } = ctx
    const candidates = moves.filter(m => sameCell(m.to, pos) || sameCell(m.coord, pos))
    if (candidates.length === 0) return { type: 'reject', reason: 'illegal' }
    return { type: 'move', move: candidates[0] }
  },
}

registerInteractionModel('move', moveModel)
registerInteractionModel('place', placeModel)
registerInteractionModel('chain', chainModel)
registerInteractionModel('drop', dropModel)
// The board is not where the turn starts. Landlords rolls before anyone moves,
// so a click on the track means "take the action that is waiting". It declared
// `interaction = 'roll'` with no such model registered, and silently got the
// move model, which wants a from and a to.
const rollModel = {
  name: 'roll',
  needsSelection: false,
  targetsFor() { return [] },
  handleClick(pos, ctx) {
    const pending = (ctx.moves || []).find(m => m.action && m.to === undefined && m.from === undefined)
    if (pending) return { type: 'move', move: pending }
    const onCell = (ctx.moves || []).filter(m => sameCell(m.to, pos) || sameCell(m.coord, pos))
    if (onCell.length) return { type: 'move', move: onCell[0] }
    return { type: 'reject', reason: 'illegal' }
  },
}

registerInteractionModel('select', selectModel)
registerInteractionModel('roll', rollModel)

export function interactionModelFor(family, override) {
  const name = override || familyInteractions.get(family)
  if (!name) {
    console.warn(`[interaction] Family "${family}" has no interactionModel declared. Defaulting to 'move'.`)
    return getInteractionModel('move')
  }
  const model = getInteractionModel(name)
  // Returning undefined for a name nobody registered is how mancala came to
  // have no interaction at all: every click reached a model that was not
  // there, and the board simply did not respond. Say so instead.
  if (!model) {
    throw new Error(
      `[interaction] Family "${family}" declares interaction model "${name}", which is not registered. ` +
      `Known models: ${listInteractionModels().join(', ')}.`
    )
  }
  return model
}

// Any move that names an action and no square is something the player takes
// with a button rather than a click. Hardcoding `pass` meant a game whose turn
// begins with an action - landlords rolls first - offered no way to begin it.
export function availableActions(moves) {
  const actions = []
  for (const move of moves || []) {
    if (!move.action) continue
    if (move.to !== undefined || move.from !== undefined || move.coord !== undefined) continue
    if (!actions.includes(move.action)) actions.push(move.action)
  }
  if (!actions.includes('resign')) actions.push('resign')
  return actions
}
