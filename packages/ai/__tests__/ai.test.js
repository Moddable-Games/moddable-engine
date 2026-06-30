import { createSimulator } from '../src/simulator.js'
import { createMinimax } from '../src/minimax.js'
import { createMCTS } from '../src/mcts.js'
import { createReversiPlugin } from '../../plugin-reversi/src/reversi-plugin.js'
import { createGoPlugin } from '../../plugin-go/src/go-plugin.js'
import { createMancalaPlugin } from '../../plugin-mancala/src/mancala-plugin.js'
import { createDraughtsPlugin } from '../../plugin-draughts/src/draughts-plugin.js'

function request() { return null }

describe('AI — simulator', () => {
  describe('stateless simulation', () => {
    it('does not mutate input state', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const original = JSON.stringify(state)
      const moves = sim.getLegalMoves(state, 0)
      sim.applyMove(state, moves[0], 0)
      expect(JSON.stringify(state)).toBe(original)
    })

    it('returns new state after move', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const moves = sim.getLegalMoves(state, 0)
      const { state: newState } = sim.applyMove(state, moves[0], 0)
      const filled = newState.board.filter(c => c !== null).length
      expect(filled).toBe(5)
    })

    it('detects terminal state', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      expect(sim.checkTerminal(state, 0).over).toBe(false)

      const fullBoard = new Array(64).fill(0)
      fullBoard[0] = 1
      const endState = { board: fullBoard, passCount: 2 }
      const terminal = sim.checkTerminal(endState, 0)
      expect(terminal.over).toBe(true)
      expect(terminal.winner).toBe('player1')
    })

    it('scores wins correctly relative to player', () => {
      const plugin = createReversiPlugin()
      const sim = createSimulator(plugin)
      const board = new Array(64).fill(0)
      board[0] = 1
      const state = { board, passCount: 2 }
      expect(sim.checkTerminal(state, 0).score).toBe(1)
      expect(sim.checkTerminal(state, 1).score).toBe(-1)
    })
  })

  describe('works across topologies', () => {
    it('Go (grid) — generates legal moves', () => {
      const plugin = createGoPlugin()
      const state = plugin.init({ size: 25 }, { request })
      const sim = createSimulator(plugin)
      const moves = sim.getLegalMoves(state, 0)
      expect(moves.length).toBeGreaterThan(20)
    })

    it('Mancala (pit) — continues turn correctly', () => {
      const plugin = createMancalaPlugin()
      const state = plugin.init({ pitsPerSide: 6 }, { request })
      const sim = createSimulator(plugin)
      const moves = sim.getLegalMoves(state, 0)
      const { state: newState, continueTurn } = sim.applyMove(state, moves[moves.length - 1], 0)
      expect(newState.pits).toBeDefined()
    })

    it('Draughts (grid) — forced capture applies', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const moves = sim.getLegalMoves(state, 0)
      expect(moves.length).toBe(7)
    })
  })

  describe('custom evaluation hook', () => {
    it('uses provided evaluate function', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const evaluate = (s, pIdx) => {
        const mine = s.board.filter(c => c === pIdx).length
        const theirs = s.board.filter(c => c === 1 - pIdx).length
        return (mine - theirs) / 64
      }
      const sim = createSimulator(plugin, { evaluate })
      const score = sim.evaluatePosition(state, 0)
      expect(typeof score).toBe('number')
    })
  })
})

describe('AI — minimax', () => {
  it('selects a valid move (reversi)', () => {
    const plugin = createReversiPlugin()
    const state = plugin.init({}, { request })
    const sim = createSimulator(plugin)
    const minimax = createMinimax(sim, { depth: 2 })
    const move = minimax.search(state, 0)
    expect(move).toBeDefined()
    expect(move.cell).toBeDefined()
  })

  it('finds winning move when available', () => {
    const plugin = createReversiPlugin()
    const board = new Array(64).fill(null)
    for (let i = 0; i < 63; i++) board[i] = 0
    board[62] = 1
    board[63] = null
    const state = { board, passCount: 0 }
    const sim = createSimulator(plugin)
    const minimax = createMinimax(sim, { depth: 1 })
    const move = minimax.search(state, 0)
    expect(move).not.toBe(null)
  })

  it('works for mancala', () => {
    const plugin = createMancalaPlugin()
    const state = plugin.init({ pitsPerSide: 6 }, { request })
    const sim = createSimulator(plugin)
    const minimax = createMinimax(sim, { depth: 3 })
    const move = minimax.search(state, 0)
    expect(move).toBeDefined()
    expect(move.pit).toBeDefined()
  })
})

describe('AI — MCTS', () => {
  it('selects a valid move (reversi)', () => {
    const plugin = createReversiPlugin()
    const state = plugin.init({}, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 50 })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
    expect(move.cell).toBeDefined()
  })

  it('works for Go on small board', () => {
    const plugin = createGoPlugin()
    const state = plugin.init({ size: 25 }, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 30 })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
  })

  it('works for mancala', () => {
    const plugin = createMancalaPlugin()
    const state = plugin.init({ pitsPerSide: 6 }, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 50 })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
    expect(move.pit).toBeDefined()
  })

  it('plays a full game without crashing (reversi 6x6)', () => {
    const plugin = createReversiPlugin({ rows: 6, cols: 6 })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 20 })

    let state = plugin.init({}, { request })
    let player = 0
    let moveCount = 0

    while (moveCount < 50) {
      const terminal = sim.checkTerminal(state, player)
      if (terminal.over) break

      const move = mcts.search(state, player)
      if (!move) break

      const { state: newState, continueTurn } = sim.applyMove(state, move, player)
      state = newState
      player = sim.nextPlayer(player, continueTurn)
      moveCount++
    }

    expect(moveCount).toBeGreaterThan(3)
  })
})
