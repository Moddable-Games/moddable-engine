import { createGameForVariant } from '../../../play/src/fen.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import '../index.js'

// engine#155. dark-chess and fog-of-war filtered correctly and filtered in the
// WRONG PLACE: `getVisibility` annotates a slice the caller already holds in
// full, so the whole board reached the renderer and the renderer was trusted
// not to draw the parts it should not. Locally that is a rendering rule; over
// an API it is the opponent's position, sent to the client, in the response.
//
// The store now projects instead, and these prove the projection withholds.

const HIDDEN_VARIANTS = ['dark-chess', 'fog-of-war', 'kriegspiel']

describe.each(HIDDEN_VARIANTS)('%s hides the opponent from the store, not just from the renderer', (variant) => {
  function gameFor() {
    return createGameForVariant('chess', variant)
  }

  it('declares that its slice holds a secret', () => {
    expect(gameFor().hasHiddenState()).toBe(true)
  })

  it('gives a seat no cell it cannot see', () => {
    const game = gameFor()
    const seen = game.viewForSeat(0).chess
    const truth = game.raw.store.get('chess')
    const hiddenCount = seen.hidden.length
    expect(hiddenCount).toBeGreaterThan(0)
    for (const pos of seen.hidden) {
      expect(seen.board[pos]).toBeNull()
    }
    // the truth still has pieces on some of those squares
    const occludedPieces = seen.hidden.filter(pos => truth.board[pos]).length
    expect(occludedPieces).toBeGreaterThan(0)
  })

  it('leaves a seat its own pieces', () => {
    const game = gameFor()
    const seen = game.viewForSeat(0).chess
    const mine = seen.board.filter(cell => cell && cell.owner === 0).length
    expect(mine).toBeGreaterThan(0)
  })

  it('shows the two seats different boards', () => {
    const game = gameFor()
    const white = game.viewForSeat(0).chess
    const black = game.viewForSeat(1).chess
    expect(white.hidden).not.toEqual(black.hidden)
  })

  it('never hands a seat a piece belonging to the other side that it cannot see', () => {
    const game = gameFor()
    const seen = game.viewForSeat(0).chess
    const knowledge = game.getVisibility(0)
    for (let pos = 0; pos < seen.board.length; pos++) {
      const cell = seen.board[pos]
      if (cell && cell.owner === 1) {
        expect(knowledge.get(pos)).toBe('known')
      }
    }
  })

  it('what crosses a boundary is serialisable and carries no hidden piece', () => {
    const game = gameFor()
    const wire = JSON.parse(JSON.stringify(game.viewForSeat(0)))
    for (const pos of wire.chess.hidden) {
      expect(wire.chess.board[pos]).toBeNull()
    }
  })
})

describe('kriegspiel specifically, which shipped as ordinary chess', () => {
  it('hides every one of the opponent\'s pieces, which is the whole variant', () => {
    const game = createGameForVariant('chess', 'kriegspiel')
    const seen = game.viewForSeat(0).chess
    expect(seen.board.filter(cell => cell && cell.owner === 1)).toEqual([])
    expect(seen.board.filter(cell => cell && cell.owner === 0)).toHaveLength(16)
  })

  it('keeps standard legality rather than king-capture, as the referee would', () => {
    const game = createGameForVariant('chess', 'kriegspiel')
    expect(game.getLegalMoves()).toHaveLength(20)
  })
})

describe('a variant that hides nothing is untouched', () => {
  it('standard chess declares no secret, so nothing is filtered', () => {
    const game = createGameForVariant('chess', 'standard')
    expect(game.hasHiddenState()).toBe(false)
    expect(game.viewForSeat(0).chess).toEqual(game.raw.store.get('chess'))
  })
})
