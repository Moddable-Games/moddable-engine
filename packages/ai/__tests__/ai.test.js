import { createSimulator } from '../src/simulator.js'
import { createMinimax, DIFFICULTIES } from '../src/minimax.js'
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

    it('handles continueTurn correctly', () => {
      const plugin = createMancalaPlugin()
      const state = plugin.init({ pitsPerSide: 6 }, { request })
      const sim = createSimulator(plugin)
      const moves = sim.getLegalMoves(state, 0)
      const { continueTurn } = sim.applyMove(state, moves[moves.length - 1], 0)
      expect(typeof continueTurn).toBe('boolean')
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

    it('Mancala (pit) — simulates full game', () => {
      const plugin = createMancalaPlugin()
      const state = plugin.init({ pitsPerSide: 6 }, { request })
      const sim = createSimulator(plugin)
      let current = state
      let player = 0
      let moveCount = 0
      while (moveCount < 100) {
        const terminal = sim.checkTerminal(current, player)
        if (terminal.over) break
        const moves = sim.getLegalMoves(current, player)
        if (moves.length === 0) break
        const { state: next, continueTurn } = sim.applyMove(current, moves[0], player)
        current = next
        player = sim.nextPlayer(player, continueTurn)
        moveCount++
      }
      expect(moveCount).toBeGreaterThan(5)
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

describe('AI — minimax (iterative deepening + TT + quiescence)', () => {
  describe('basic operation', () => {
    it('selects a valid move (reversi)', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { difficulty: 'beginner' })
      const move = minimax.search(state, 0)
      expect(move).toBeDefined()
      expect(move.cell).toBeDefined()
    })

    it('works for mancala', () => {
      const plugin = createMancalaPlugin()
      const state = plugin.init({ pitsPerSide: 6 }, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { difficulty: 'easy' })
      const move = minimax.search(state, 0)
      expect(move).toBeDefined()
      expect(move.pit).toBeDefined()
    })

    it('returns only move immediately (no search needed)', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(0)
      board[0] = null
      board[1] = 1
      const state = { board, passCount: 0 }
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { difficulty: 'expert' })
      const move = minimax.search(state, 0)
      expect(move.cell).toBe(0)
    })
  })

  describe('difficulty levels', () => {
    it('beginner plays suboptimally (selects from top 5)', () => {
      expect(DIFFICULTIES.beginner.topN).toBe(5)
      expect(DIFFICULTIES.beginner.spread).toBe(0.5)
      expect(DIFFICULTIES.beginner.maxDepth).toBe(2)
    })

    it('expert plays deterministically (top 1, no spread)', () => {
      expect(DIFFICULTIES.expert.topN).toBe(1)
      expect(DIFFICULTIES.expert.spread).toBe(0)
      expect(DIFFICULTIES.expert.maxDepth).toBe(50)
    })

    it('all difficulties produce valid moves', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)

      for (const level of Object.keys(DIFFICULTIES)) {
        const minimax = createMinimax(sim, { difficulty: level })
        const move = minimax.search(state, 0)
        expect(move).toBeDefined()
        expect(move.cell).toBeDefined()
      }
    })
  })

  describe('iterative deepening', () => {
    it('searches progressively deeper', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { depth: 4, timeLimit: 5000, topN: 1, spread: 0 })
      const move = minimax.search(state, 0)
      expect(move).toBeDefined()
      expect(minimax.getStats().nodesSearched).toBeGreaterThan(10)
    })
  })

  describe('transposition table', () => {
    it('can be cleared between games', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { difficulty: 'medium' })
      minimax.search(state, 0)
      minimax.clearTT()
      const move = minimax.search(state, 0)
      expect(move).toBeDefined()
    })
  })

  describe('time management', () => {
    it('respects time limit', () => {
      const plugin = createDraughtsPlugin({ rows: 10, cols: 10, piecesPerPlayer: 20 })
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { timeLimit: 100, maxDepth: 50, topN: 1, spread: 0 })
      const start = Date.now()
      minimax.search(state, 0)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(500)
    })
  })

  describe('board-size adaptive depth', () => {
    it('limits depth for large branching factor games', () => {
      const plugin = createGoPlugin()
      const state = plugin.init({ size: 81 }, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, { timeLimit: 200, maxDepth: 50, topN: 1, spread: 0 })
      const start = Date.now()
      minimax.search(state, 0)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000)
    })
  })

  describe('quiescence (capture extension)', () => {
    it('uses quiescence when isQuiet provided', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      const sim = createSimulator(plugin)
      const minimax = createMinimax(sim, {
        difficulty: 'medium',
        isQuiet: (move) => !move.captures || move.captures.length === 0,
      })
      const move = minimax.search(state, 0)
      expect(move).toBeDefined()
    })
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

  it('works for mancala', () => {
    const plugin = createMancalaPlugin()
    const state = plugin.init({ pitsPerSide: 6 }, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 50 })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
    expect(move.pit).toBeDefined()
  })

  it('uses evaluated rollouts when evaluate provided', () => {
    const plugin = createReversiPlugin()
    const state = plugin.init({}, { request })
    const evaluate = (s, p) => {
      const mine = s.board.filter(c => c === p).length
      return mine / 64
    }
    const sim = createSimulator(plugin, { evaluate })
    const mcts = createMCTS(sim, { iterations: 30, evaluate: true })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
  })

  it('respects time limit', () => {
    const plugin = createReversiPlugin()
    const state = plugin.init({}, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { iterations: 100000, timeMs: 100 })
    const start = Date.now()
    mcts.search(state, 0)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
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

  it('difficulty levels configure iterations and time', () => {
    const plugin = createReversiPlugin()
    const state = plugin.init({}, { request })
    const sim = createSimulator(plugin)
    const mcts = createMCTS(sim, { difficulty: 'beginner' })
    const move = mcts.search(state, 0)
    expect(move).toBeDefined()
  })
})
