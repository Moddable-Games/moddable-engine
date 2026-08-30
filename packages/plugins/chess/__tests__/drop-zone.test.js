import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#158. Xiang Fu declared no `drops` key at all, so its drop rule and its
// captures-to-hand rule simply never happened.
//
// Turning `drops` on alone would have been the wrong fix and the same category
// error draughts made with `capture.replacement`: the existing drop generator
// is crazyhouse's, which drops onto any empty square, and Xiang Fu drops only
// within its owner's own first two ranks. `dropZone` states that restriction,
// counting rows from the player's own edge exactly as `placementZone` already
// did - one convention, not two.

function rowsOfDropsFor(variant, cols, plies = 300) {
  const game = createGameForFamily('chess', { variant, rngSeed: 1 })
  const seen = {}
  for (let i = 0; i < plies; i++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    const drops = moves.filter(m => m.action === 'drop')
    if (drops.length) {
      const seat = game.currentPlayer()
      if (!seen[seat]) {
        seen[seat] = [...new Set(drops.map(m => Math.floor(m.to / cols)))].sort((a, b) => a - b)
        if (Object.keys(seen).length === 2) break
      }
    }
    const board = (game.getState()?.slice || game.getState()).board
    const capture = moves.find(m => m.to !== undefined && board[m.to])
    game.applyMove(capture || moves[i % moves.length])
  }
  return seen
}

describe('dropZone (engine#158)', () => {
  it('confines a Xiang Fu drop to the dropping player\'s own first two ranks', () => {
    const rows = rowsOfDropsFor('xiang-fu', 9)
    expect(Object.keys(rows).length).toBe(2)
    // 9 rows, so seat at the top owns 0 and 1 and the other owns 7 and 8.
    const bands = Object.values(rows).map(r => r.join(','))
    expect(bands.sort()).toEqual(['0,1', '7,8'])
  })

  it('leaves crazyhouse dropping anywhere, having never declared a zone', () => {
    const rows = rowsOfDropsFor('crazyhouse', 8)
    const widest = Math.max(...Object.values(rows).map(r => r.length))
    expect(widest).toBeGreaterThan(2)
  })

  it('offers no drop at all before anything has been captured', () => {
    const game = createGameForFamily('chess', { variant: 'xiang-fu', rngSeed: 1 })
    expect(game.getLegalMoves().some(m => m.action === 'drop')).toBe(false)
  })
})
