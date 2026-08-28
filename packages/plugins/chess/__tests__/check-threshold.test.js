import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGame } from '../../../play/src/sdk.js'

// engine#88. single-check, three-check and five-check were three JavaScript
// modules identical apart from one integer - 1, 3 and 5 - and that integer was
// already declared as `checkThreshold` in each variant's own frontmatter. The
// win condition is now `win.threshold` in the shared rule registry, configured
// from that frontmatter value, and the three modules no longer carry one.
//
// Writing this test found that none of the three had ever worked. `checkCount`
// was never initialised, and the only line that incremented it sat inside
// searchMakeMove - the AI's make and unmake path - behind a `state.checkCount &&`
// guard that was therefore never true. In a real game the counter did not
// exist, so the threshold was never reached and all three played as ordinary
// chess while sitting in the playable count. Same class as engine#158.
//
// So this file asserts both halves: the plugin counts a delivered check, and
// the registry rule ends the game when the count reaches the declared figure.

function setupGame(variant, fen, playerJustMoved = 0) {
  const game = createGame('chess', variant)
  const topo = game.topology
  const vocab = game.raw.registry.getPlugins().find(p => p.sliceName === 'chess')?.vocabulary || {}
  const board = topo.parsePosition(fen, vocab)
  const slice = { ...game.getState().slice, board }
  game.loadState({ slice, players: { currentIndex: playerJustMoved } })
  return game
}

// White rook a1, white king h1, black king e8. Ra1-a8 is check along the rank.
const ROOK_CHECK_FEN = '4k3/8/8/8/8/8/8/R6K'

function sliceOf(game) {
  const state = game.getState()
  return state.slice || state
}

describe('check threshold, counted by the plugin and decided by the registry', () => {
  it('initialises the counter, which nothing used to do', () => {
    const game = createGame('chess', 'threeCheck')
    expect(sliceOf(game).checkCount).toEqual({ 0: 0, 1: 0 })
  })

  it('does not initialise it for a variant that does not count checks', () => {
    const game = createGame('chess', 'standard')
    expect(sliceOf(game).checkCount).toBeUndefined()
  })

  it('counts a delivered check in real play, not only inside the AI search', () => {
    const game = setupGame('threeCheck', ROOK_CHECK_FEN, 0)
    const check = game.getLegalMoves().find(m => m.from === 56 && m.to === 0)
    expect(check).toBeTruthy()

    expect(sliceOf(game).checkCount).toEqual({ 0: 0, 1: 0 })
    game.applyMove(check)
    expect(sliceOf(game).checkCount[0]).toBe(1)
  })

  it('leaves the slice it was handed alone, so the search need not copy it', () => {
    const game = setupGame('threeCheck', ROOK_CHECK_FEN, 0)
    const before = sliceOf(game)
    const snapshot = JSON.stringify(before.checkCount)
    game.applyMove(game.getLegalMoves().find(m => m.from === 56 && m.to === 0))
    expect(JSON.stringify(before.checkCount)).toBe(snapshot)
  })

  it('single-check ends on the first check, from its frontmatter threshold', () => {
    const game = setupGame('singleCheck', ROOK_CHECK_FEN, 0)
    expect(game.checkWin()).toBeNull()
    game.applyMove(game.getLegalMoves().find(m => m.from === 56 && m.to === 0))
    expect(game.checkWin()).toBe(0)
  })

  it('three-check does not end on the first check', () => {
    const game = setupGame('threeCheck', ROOK_CHECK_FEN, 0)
    game.applyMove(game.getLegalMoves().find(m => m.from === 56 && m.to === 0))
    expect(game.checkWin()).toBeNull()
  })

  // The three variants differ only by this number, which is the whole point:
  // one rule, three frontmatter values, no JavaScript between them.
  it.each([
    ['singleCheck', 1],
    ['threeCheck', 3],
    ['fiveCheck', 5],
  ])('%s ends at exactly %i, and not before', (variant, threshold) => {
    const game = setupGame(variant, ROOK_CHECK_FEN, 0)

    const below = { ...sliceOf(game), checkCount: { 0: threshold - 1, 1: 0 } }
    game.loadState({ slice: below, players: { currentIndex: 0 } })
    expect(game.checkWin()).toBeNull()

    const at = { ...sliceOf(game), checkCount: { 0: threshold, 1: 0 } }
    game.loadState({ slice: at, players: { currentIndex: 0 } })
    expect(game.checkWin()).toBe(0)
  })

  it('credits the seat that delivered the checks, not the one to move', () => {
    const game = setupGame('threeCheck', ROOK_CHECK_FEN, 0)
    const slice = { ...sliceOf(game), checkCount: { 0: 0, 1: 3 } }
    game.loadState({ slice, players: { currentIndex: 0 } })
    expect(game.checkWin()).toBe(1)
  })
})
