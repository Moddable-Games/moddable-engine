import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#158. Xiang Fu is Spartan-style: each side starts with two royal
// Champions, and a captured Champion is supposed to arrive in the opponent's
// hand as a Pupil - same move, not royal. The plugin knew one transformation,
// reverting a promoted piece to a pawn, so the Champion came back a Champion
// and could be dropped as a third royal piece onto a board that starts with
// two. Random play reached four Champions on the board inside 400 plies.
//
// `demotionMap` is the key the shogi plugin already reads for this, so the two
// families say it the same way.

function playUntilChampionCaptured(seed, plies = 400) {
  const game = createGameForFamily('chess', { variant: 'xiang-fu', rngSeed: seed })
  const rng = createRng(seed)
  const handsAfterCapture = []
  let maxChampionsOnBoard = 0
  for (let i = 0; i < plies; i++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    const before = game.getState()?.slice || game.getState()
    const move = moves[Math.floor(rng.next() * moves.length)]
    const target = move.to !== undefined ? before.board[move.to] : null
    const result = game.applyMove(move)
    if (!result || !result.ok) break
    const after = game.getState()?.slice || game.getState()
    for (const seat of [0, 1]) {
      maxChampionsOnBoard = Math.max(
        maxChampionsOnBoard,
        after.board.filter(c => c && c.type === 'champion' && c.owner === seat).length
      )
    }
    if (target && target.type === 'champion') handsAfterCapture.push(after.hands.flat())
    if (result.winner) break
  }
  return { handsAfterCapture, maxChampionsOnBoard }
}

describe('capture demotion into hand (engine#158)', () => {
  it('turns a captured Xiang Fu Champion into a Pupil', () => {
    const seeds = [3, 11, 29]
    const withCaptures = seeds
      .map(seed => playUntilChampionCaptured(seed))
      .filter(r => r.handsAfterCapture.length)
    // A run in which no Champion is ever taken proves nothing.
    expect(withCaptures.length).toBeGreaterThan(0)

    for (const run of withCaptures) {
      for (const hand of run.handsAfterCapture) {
        expect(hand).toContain('pupil')
        expect(hand).not.toContain('champion')
      }
    }
  })

  it('never lets a side field more Champions than the two it started with', () => {
    for (const seed of [3, 11, 29]) {
      const { maxChampionsOnBoard } = playUntilChampionCaptured(seed)
      expect(maxChampionsOnBoard).toBeLessThanOrEqual(2)
    }
  })

  it('still reverts a promoted crazyhouse piece to a pawn, which declares no map', () => {
    const game = createGameForFamily('chess', { variant: 'crazyhouse', rngSeed: 1 })
    const state = game.getState()?.slice || game.getState()
    expect(state.hands).toEqual([[], []])
  })
})
