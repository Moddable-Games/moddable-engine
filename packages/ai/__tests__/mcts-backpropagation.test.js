// Whose point of view a node's score is kept in.
//
// `selectChild` reads `child.totalScore / child.visits` and does not negate it,
// so a node's score has to belong to whoever moved into that node. Backprop
// used to flip the score once per level walking up from the expanded node,
// which is the same thing only when two conditions both hold: the players
// strictly alternate, and the value handed in already belongs to the expanded
// node's parent.
//
// Neither held. The rollout returns a value for the player at the ROOT, so
// nodes at odd depth were scored correctly and nodes at even depth were scored
// inverted - the search spent half its tree rewarding itself for the
// opponent's good positions. And `continueTurn`, which the simulator supports
// so a player can move twice in a row, breaks the alternation outright.
import { createMCTS } from '../src/mcts.js'

// A game with one decision and an immediate, knowable outcome: move 'win'
// wins for whoever plays it, move 'lose' hands the win to the other player.
// Anything that searches this correctly plays 'win'.
function decisiveGame() {
  return {
    cloneState: s => ({ ...s, history: [...s.history] }),
    getLegalMoves: (state) => (state.done ? [] : ['win', 'lose', 'stall']),
    applyMove: (state, move, playerIndex) => ({
      state: {
        ...state,
        history: [...state.history, move],
        done: move !== 'stall' || state.history.length >= 3,
        winner: move === 'win' ? playerIndex : move === 'lose' ? 1 - playerIndex : null,
      },
      continueTurn: false,
    }),
    nextPlayer: (p, continueTurn) => (continueTurn ? p : 1 - p),
    checkTerminal: (state) => (state.done
      ? { over: true, winner: state.winner === null ? 'draw' : state.winner }
      : { over: false }),
    evaluatePosition: () => 0,
  }
}

const START = { history: [], done: false, winner: null }

describe('MCTS scores a node for whoever moved into it', () => {
  it('finds the winning move rather than the losing one', () => {
    const mcts = createMCTS(decisiveGame(), { iterations: 600, exploration: 1.41 })
    expect(mcts.search(START, 0)).toBe('win')
    expect(mcts.search(START, 1)).toBe('win')
  })

  // The specific shape the old flip got wrong: a value that has to travel more
  // than one level before it reaches the root.
  it('is not fooled by outcomes that are two levels deep', () => {
    // 'bait' looks fine for the mover and loses on the reply. A search that
    // inverts even depths prefers exactly this move.
    const sim = {
      cloneState: s => ({ ...s, history: [...s.history] }),
      getLegalMoves: (state) => (state.done ? [] : ['safe', 'bait']),
      applyMove: (state, move, playerIndex) => {
        const history = [...state.history, move]
        // The bait resolves on the OPPONENT's reply: whoever played 'bait'
        // loses, one ply later.
        const baited = history.length === 2 && history[0] === 'bait'
        return {
          state: {
            ...state,
            history,
            done: history.length >= 2,
            winner: baited ? playerIndex : (history.length >= 2 ? null : null),
            _mover: playerIndex,
          },
          continueTurn: false,
        }
      },
      nextPlayer: (p, continueTurn) => (continueTurn ? p : 1 - p),
      checkTerminal: (state) => (state.done
        ? { over: true, winner: state.winner === null ? 'draw' : state.winner }
        : { over: false }),
      evaluatePosition: () => 0,
    }
    const mcts = createMCTS(sim, { iterations: 800, exploration: 1.0 })
    expect(mcts.search(START, 0)).toBe('safe')
  })

  it('reads a truncated rollout off the evaluator instead of calling it a draw', () => {
    const seen = []
    const sim = {
      ...decisiveGame(),
      getLegalMoves: () => ['a', 'b'],
      applyMove: (state, move, playerIndex) => ({
        state: { ...state, history: [...state.history, move] },
        continueTurn: false,
      }),
      checkTerminal: () => ({ over: false }),
      evaluatePosition: (state, playerIndex) => {
        seen.push(playerIndex)
        return state.history[0] === 'a' ? 0.8 : -0.8
      },
    }
    const mcts = createMCTS(sim, { iterations: 200, maxRolloutDepth: 3 })
    expect(mcts.search(START, 0)).toBe('a')
    // A rollout that ran out of depth used to return a flat 0.5 without ever
    // asking the simulator what the position was worth.
    expect(seen.length).toBeGreaterThan(0)
  })

  it('keeps the value inside [0, 1] however the evaluator is scaled', () => {
    const sim = {
      ...decisiveGame(),
      getLegalMoves: () => ['a', 'b'],
      applyMove: (state, move) => ({ state: { ...state, history: [...state.history, move] }, continueTurn: false }),
      checkTerminal: () => ({ over: false }),
      // Centipawn-scale evaluators exist; (score + 1) / 2 on one of those is
      // not a probability.
      evaluatePosition: (state) => (state.history[0] === 'a' ? 900 : -900),
    }
    const mcts = createMCTS(sim, { iterations: 120, maxRolloutDepth: 2 })
    expect(mcts.search(START, 0)).toBe('a')
  })
})
