// `royalType` was a single string. That cannot describe a variant whose two
// sides do not share a royal piece, and two shipped variants are exactly that:
// Synochess pairs a Western King against an Eastern Chancellor, Empire a King
// against an Emperor. Neither declared anything, so both fell back to `king`,
// and the side without one had no royal at all.
//
// Synochess was `playable: true` the whole time. Black could not be checked,
// could not be checkmated, and the faceoff rule its own page lists as a win
// condition never fired. Empire hid the same gap behind a hand-written
// winCondition in JavaScript that hardcoded both piece names and an 8-wide
// board; that module is gone and this is what replaces it.
import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGame } from '../../../play/src/sdk.js'

function setup(variant, fen, playerJustMoved = 0) {
  const game = createGame('chess', variant)
  const vocab = game.raw.registry.getPlugins().find(p => p.sliceName === 'chess')?.vocabulary || {}
  const board = game.topology.parsePosition(fen, vocab)
  game.loadState({
    slice: { ...game.getState().slice, board },
    players: { currentIndex: playerJustMoved },
  })
  return game
}

const A8 = 0, B8 = 1

describe('a per-player royal type', () => {
  // Black chancellor a8, white queen b7 defended by a rook on b6.
  it('checkmates the side whose royal is not a king', () => {
    expect(setup('synochess', 'c7/1Q6/1R6/8/8/8/8/7K').checkWin()).toBe(0)
  })

  it('keeps that royal off attacked squares', () => {
    // A rook on c7 covers rank 7, so a7 and b7 are out and only b8 remains.
    const game = setup('synochess', 'c7/2R5/8/8/8/8/8/7K', 1)
    const moves = game.getLegalMoves().filter(m => m.from === A8)
    expect(moves.map(m => m.to)).toEqual([B8])
  })

  it('never sends a royal to hand, even in a variant with drops', () => {
    const game = setup('synochess', 'c7/8/8/8/8/8/8/R6K')
    game.applyMove({ from: 56, to: A8 })
    const hands = game.getState().slice.hands
    expect(hands ? hands[0] : []).not.toContain('chancellor')
  })

  it('still reads a plain string for a symmetric variant', () => {
    expect(setup('standard', 'k7/1Q6/1R6/8/8/8/8/7K').checkWin()).toBe(0)
  })
})

describe('the faceoff rule', () => {
  it.each([
    ['synochess', 'c'],
    ['empire', 'e'],
  ])('%s: an open file between the royals loses for the mover', (variant, royal) => {
    expect(setup(variant, `4${royal}3/8/8/8/8/8/8/4K3`).checkWin()).toBe(1)
  })

  it.each([
    ['synochess', 'c'],
    ['empire', 'e'],
  ])('%s: a piece between the royals blocks it', (variant, royal) => {
    expect(setup(variant, `4${royal}3/8/8/8/4P3/8/8/4K3`).checkWin()).toBeNull()
  })

  it('different files are not a faceoff', () => {
    expect(setup('synochess', '3c4/8/8/8/8/8/8/4K3').checkWin()).toBeNull()
  })

  it('a variant that does not declare it is unaffected', () => {
    expect(setup('standard', '4k3/8/8/8/8/8/8/4K3').checkWin()).toBeNull()
  })
})
