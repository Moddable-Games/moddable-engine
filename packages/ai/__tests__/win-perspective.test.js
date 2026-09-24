import '../../play/test-helpers/setup-rules-reader.js'
import { createGameForVariant, loadFen } from '../../play/src/fen.js'
import { createAI } from '../../play/src/sdk.js'
import { createSimulator } from '../src/simulator.js'
import { createMCTS } from '../src/mcts.js'

// Found rating puzzles against the AI (engine#178). The game asks checkWin
// before the turn passes, so a plugin answers from the side that just moved.
// The simulator asked from the side about to move, and only chess had a win
// test of its own besides, so outside chess minimax did not see a win: a
// draughts position won by leaving the opponent no move read as a draw, and an
// engine-generated win-in-1 went unsolved at every level.

// Black to move; g7-h6 leaves White's last man with nowhere to go.
const BLOCKED = '9b/8b1/5b4/2b1b1b3/10/2b5b1/9w/10/10/10 b - - 0 1'

function position(fen) {
  const game = createGameForVariant('draughts', 'international')
  loadFen(game, fen)
  return game.getState()
}

test('minimax sees a draughts win by leaving the opponent no move', () => {
  const state = position(BLOCKED)
  for (const difficulty of ['beginner', 'expert']) {
    const ai = createAI('draughts', 'international', { difficulty, search: 'minimax', searchOpts: { deterministic: true, random: () => 0.5 } })
    const move = ai.pickMove(structuredClone(state.slice), state.players.currentIndex)
    expect({ difficulty, from: move.from, to: move.to }).toEqual({ difficulty, from: 36, to: 47 })
  }
})

test('the simulator reads that win from the mover, and names its seat', () => {
  const state = position(BLOCKED)
  const ai = createAI('draughts', 'international', { search: 'minimax' })
  const sim = ai.simulator
  const move = sim.getLegalMoves(state.slice, 1).find(m => m.from === 36 && m.to === 47)
  const after = sim.applyMove(state.slice, move, 1).state
  const terminal = sim.checkTerminal(after, 0)
  expect(terminal.over).toBe(true)
  expect(terminal.winnerIndex).toBe(1)
})

test('MCTS gives a named winner to that seat, not to seat 0', () => {
  // A one-move game: seat 1 moves and wins, named "black".
  const plugin = {
    sliceName: 'toy',
    getLegalMoves: (slice, full) => (slice.done ? [] : [{ id: full.__players.currentIndex }]),
    applyMove: (move, slice) => ({ ...slice, done: true, winner: move.id }),
    checkWin: (slice) => (slice.done ? (slice.winner === 1 ? 'black' : 'white') : null),
  }
  const sim = createSimulator(plugin, { playerNames: ['white', 'black'] })
  const mcts = createMCTS(sim, { iterations: 20, deterministic: true, random: () => 0.5 })
  mcts.search({ done: false }, 1)
  const terminal = sim.checkTerminal({ done: true, winner: 1 }, 0, 1)
  expect(terminal.winnerIndex).toBe(1)
})

test('a drawn end is worth nothing to either side', () => {
  const plugin = {
    sliceName: 'toy',
    getLegalMoves: (slice) => (slice.over ? [] : [{ a: 1 }]),
    applyMove: (move, slice) => ({ ...slice, over: true }),
    checkWin: (slice) => (slice.over ? 'draw' : null),
  }
  const sim = createSimulator(plugin)
  expect(sim.checkWinConditionOnly({ over: true }, 0)).toEqual({ over: true, score: 0 })
})
