// Two bugs made morris unplayable past its eighteenth move, and both of them
// were invisible to a test that asked whether the board rendered.
//
// 1. A family declares ONE interaction model. Morris declares `place`, which
//    matches a move of the shape `{action, to}` and rejects anything carrying a
//    `from`. Morris places nine men each and then moves them, so the moment the
//    last man went down and the moves became `{action:'move', from, to}`, every
//    click on the board was rejected and the human had no legal way to
//    continue.
//
// 2. The controller read a cell with `state.board[pos] || null`. Morris and hex
//    store a bare seat index in the cell, so every piece belonging to seat 0
//    read as an empty square and could not be selected. The same falsy-zero
//    shape as the seat-0 serialisation bug.
//
// And one more the interface got quietly wrong: closing a mill offers one move
// per removable enemy piece, differing only in `remove`, and the interface took
// the first without asking. A player closed a mill and a piece they had not
// chosen disappeared.
import '../src/bootstrap-plugins.js'
import '../test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'
import { interactionModelFor, modelForMoves } from '../src/interaction.js'

function morrisAfterPlacement(seed = 3) {
  const game = createGameForFamily('morris', { variant: 'nine-mens-morris', rngSeed: seed })
  for (let i = 0; i < 18; i++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    game.applyMove(moves[0])
  }
  return game
}

describe('the interaction model follows the moves, not the family name', () => {
  it('leaves a placement game on its declared model', () => {
    const declared = interactionModelFor('morris')
    expect(declared.name).toBe('place')
    const placing = [{ action: 'place', to: 'n1' }, { action: 'place', to: 'n2' }]
    expect(modelForMoves(declared, placing).name).toBe('place')
  })

  it('upgrades to a from-and-to model once the moves carry a from', () => {
    const declared = interactionModelFor('morris')
    const moving = [{ action: 'move', from: 'n13', to: 'n21' }]
    expect(modelForMoves(declared, moving).name).toBe('move')
  })

  it('does not downgrade a model that already selects a source', () => {
    const declared = interactionModelFor('draughts')
    const moving = [{ action: 'move', from: 1, to: 2 }]
    expect(modelForMoves(declared, moving)).toBe(declared)
  })

  it('morris really does change shape at move eighteen', () => {
    const game = morrisAfterPlacement()
    const moves = game.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.from !== undefined)).toBe(true)
  })
})

describe('a man can be moved once every man is placed', () => {
  it('selects a piece owned by seat 0 and moves it', () => {
    const game = morrisAfterPlacement()
    const names = game.raw.definition.players.names
    const ctrl = createGameController(game.raw, {
      family: 'morris',
      players: Object.fromEntries(names.map(n => [n, 'human'])),
    })
    const first = game.getLegalMoves()[0]
    const before = JSON.stringify(game.getState().slice.board)

    ctrl.handleClick(first.from)
    ctrl.handleClick(first.to)

    expect(JSON.stringify(game.getState().slice.board)).not.toBe(before)
  })

  // The falsy-zero half, on its own, because it is the half that would come
  // back silently: seat 1 works either way.
  it('sees a piece in a cell that holds seat index 0', () => {
    const game = morrisAfterPlacement()
    const board = game.getState().slice.board
    const seatZero = Object.keys(board).find(k => board[k] === 0)
    expect(seatZero).toBeDefined()

    const names = game.raw.definition.players.names
    const ctrl = createGameController(game.raw, {
      family: 'morris',
      players: Object.fromEntries(names.map(n => [n, 'human'])),
    })
    // `getPieceAt` is not exported, so this asks the question the way a click
    // does: a seat-0 man that the controller cannot see cannot be selected.
    const movable = game.getLegalMoves().filter(m => board[m.from] === 0)
    if (movable.length === 0) return
    ctrl.handleClick(movable[0].from)
    expect(ctrl.getState().selected).toBe(movable[0].from)
  })
})

describe('closing a mill asks which piece comes off', () => {
  it('offers the choice instead of taking the first', () => {
    const game = createGameForFamily('morris', { variant: 'nine-mens-morris', rngSeed: 3 })
    const names = game.raw.definition.players.names
    let offered = null
    const ctrl = createGameController(game.raw, {
      family: 'morris',
      players: Object.fromEntries(names.map(n => [n, 'human'])),
      onChoiceNeeded: (choices, _player, pick) => { offered = choices; pick(choices[choices.length - 1]) },
    })

    let reached = false
    for (let ply = 0; ply < 60 && !reached; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const mills = moves.filter(m => m.remove !== undefined && m.from !== undefined)
      if (mills.length) {
        const targets = [...new Set(
          mills.filter(m => m.from === mills[0].from && m.to === mills[0].to).map(m => m.remove)
        )]
        if (targets.length > 1) {
          const before = { ...game.getState().slice.board }
          ctrl.handleClick(mills[0].from)
          ctrl.handleClick(mills[0].to)
          const after = game.getState().slice.board
          expect(offered).not.toBeNull()
          expect(offered.length).toBe(targets.length)
          // and the answer was honoured: the piece the caller chose is the one
          // that went, not whichever happened to be first.
          const chosen = offered[offered.length - 1]
          expect(before[chosen]).not.toBeNull()
          expect(after[chosen]).toBeNull()
          reached = true
        }
      }
      if (!reached) game.applyMove(moves[0])
    }
    expect(reached).toBe(true)
  })
})
