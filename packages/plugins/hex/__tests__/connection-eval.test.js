// The hex family shipped with no evaluator at all. `getEvaluator('hex')`
// returned nothing, the generic fallback reads `state.board` as an array and a
// hex board is an object keyed by cell, so every position on the board scored
// exactly 0 and the search chose whichever move `getLegalMoves` happened to
// return first.
//
// Measured against a uniformly random opponent on the 11x11 board, that search
// won 3 games out of 6 - it won every game it moved first, because Hex gives
// the first player a proven win, and lost every game it moved second. To a
// random player.
//
// These are the properties that stop it going back to that, each one a thing
// the old behaviour would have failed.
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { findFamilyPlugin } from '../../../play/src/find-plugin.js'
import { createHexPlugin } from '../src/hex-plugin.js'

function pluginFor(variant) {
  const game = createGameForFamily('hex', { variant })
  return { plugin: findFamilyPlugin(game.raw.registry.getPlugins(), 'hex'), game }
}

describe('the connection evaluator', () => {
  it('is offered by the plugin, because nothing outside it knows the board', () => {
    const { plugin } = pluginFor('standard')
    expect(typeof plugin.evaluate).toBe('function')
  })

  it('calls an empty board even', () => {
    const { plugin, game } = pluginFor('standard')
    const slice = game.getState().slice
    expect(plugin.evaluate(slice, 0)).toBeCloseTo(0, 6)
    expect(plugin.evaluate(slice, 1)).toBeCloseTo(0, 6)
  })

  it('scores a completed connection decisively, and its opponent as lost', () => {
    const { plugin, game } = pluginFor('standard')
    const slice = game.getState().slice
    const board = { ...slice.board }
    let placed = 0
    for (const cell of Object.keys(board)) {
      if (Number(cell.split(',')[0]) === 5) { board[cell] = 0; placed++ }
    }
    expect(placed).toBe(11)
    const won = { ...slice, board }
    expect(plugin.checkWin(won)).toBe(0)
    expect(plugin.evaluate(won, 0)).toBeGreaterThan(0.5)
    expect(plugin.evaluate(won, 1)).toBeLessThan(-0.5)
  })

  // The whole point. A shortest-path evaluator gives every one of the 121
  // openings the same score, because on an empty board every cell shortens the
  // route by exactly one, and a search cannot choose between moves it cannot
  // tell apart.
  it('tells the 121 opening moves apart', () => {
    const { plugin, game } = pluginFor('standard')
    const slice = game.getState().slice
    const scores = Object.keys(slice.board).map(cell =>
      plugin.evaluate({ ...slice, board: { ...slice.board, [cell]: 0 } }, 0))
    const distinct = new Set(scores.map(s => s.toFixed(4)))
    expect(distinct.size).toBeGreaterThanOrEqual(20)
  })

  it('prefers the middle of the board to the acute corners', () => {
    const { plugin, game } = pluginFor('standard')
    const slice = game.getState().slice
    const at = cell => plugin.evaluate({ ...slice, board: { ...slice.board, [cell]: 0 } }, 0)
    expect(at('5,5')).toBeGreaterThan(at('0,0'))
    expect(at('5,5')).toBeGreaterThan(at('10,10'))
  })

  it('is symmetric: what is good for one seat is bad for the other', () => {
    const { plugin, game } = pluginFor('standard')
    const slice = game.getState().slice
    const board = { ...slice.board, '5,5': 0, '4,6': 0, '6,4': 1 }
    const position = { ...slice, board }
    expect(plugin.evaluate(position, 0)).toBeCloseTo(-plugin.evaluate(position, 1), 6)
  })

  it('answers for Y as well as for hex, where both players want all three sides', () => {
    const { plugin, game } = pluginFor('y-game')
    const slice = game.getState().slice
    expect(plugin.evaluate(slice, 0)).toBeCloseTo(0, 6)
    const scores = Object.keys(slice.board).map(cell =>
      plugin.evaluate({ ...slice, board: { ...slice.board, [cell]: 0 } }, 0))
    expect(new Set(scores.map(s => s.toFixed(4))).size).toBeGreaterThanOrEqual(5)
  })

  // A hex rollout only produces a result once the board is full, and the
  // default cut-off is shorter than the standard board.
  it('asks for a rollout long enough to fill the board it plays on', () => {
    expect(createHexPlugin.mcts).toBe(true)
    expect(createHexPlugin.searchPolicies().maxRolloutDepth).toBeGreaterThan(121)
  })
})
