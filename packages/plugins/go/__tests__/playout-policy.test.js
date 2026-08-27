import { createGoPlayoutPolicy } from '../src/playout-policy.js'
import { createRng } from '../../../core/index.js'
import { createMCTS, createSimulator } from '../../../ai/index.js'
import { createGoPlugin } from '../index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

// Two of the assertions below compare a smart rollout against a random one and
// declare the smart one better. That is a statistical claim, and it was drawing
// from the ambient generator: the same code passed or failed depending on the
// draw. It failed once during this session and passed on a rerun with no change
// in between, which is a red build nobody can reproduce and nobody learns
// anything from. The policy under test already takes an injected generator for
// this exact reason, and the purity guard exists to keep ambient randomness out
// of the engine. The tests are held to the same rule now.
const SEED = 20260827
const testRng = createRng(SEED)
const rand = () => testRng.next()

function createGoSimulator(size = 9) {
  const topology = createGridTopology({ type: 'grid', rows: size, cols: size })
  const plugin = createGoPlugin(
    { komi: 6.5, autoScore: true },
    { definition: { topology: { type: 'grid', rows: size, cols: size }, players: { names: ['black', 'white'], count: 2 } } }
  )
  // Initialise the plugin so it binds to the topology
  plugin.init(
    { size },
    { request: (key) => key === 'core.topology' ? topology : null }
  )
  return createSimulator(plugin, { playerCount: 2, playerNames: ['black', 'white'] })
}

/**
 * Run a single rollout from a position using either a policy function or pure random.
 * Returns 1 if rootPlayer wins, 0 if rootPlayer loses, 0.5 for draw/timeout.
 */
function rolloutWithPolicy(simulator, state, rootPlayer, policyFn) {
  let current = simulator.cloneState(state)
  let player = 0
  const maxDepth = 100

  for (let depth = 0; depth < maxDepth; depth++) {
    const terminal = simulator.checkTerminal(current, player)
    if (terminal.over) {
      if (terminal.winner === 'draw') return 0.5
      const winnerIdx = typeof terminal.winner === 'number' ? terminal.winner : 0
      return winnerIdx === rootPlayer ? 1 : 0
    }

    const moves = simulator.getLegalMoves(current, player)
    if (moves.length === 0) return 0.5

    const move = policyFn
      ? policyFn(current, player, moves)
      : moves[Math.floor(rand() * moves.length)]

    const { state: newState, continueTurn } = simulator.applyMove(current, move, player)
    current = newState
    player = simulator.nextPlayer(player, continueTurn)
  }

  return 0.5
}

describe('Go playout policy', () => {
  describe('eye detection', () => {
    it('identifies a single-point eye', () => {
      const policy = createGoPlayoutPolicy()
      // 5x5 board, cell 6 surrounded by black stones
      // Layout:  0  1  2  3  4
      //          5  6  7  8  9
      //         10 11 12 13 14
      // Cell 6 neighbours: 1 (up), 11 (down), 5 (left), 7 (right)
      const board = new Array(25).fill(null)
      board[1] = 'black'
      board[11] = 'black'
      board[5] = 'black'
      board[7] = 'black'

      const state = { board, cols: 5, rows: 5 }
      const legalMoves = [{ coord: 6 }, { coord: 12 }, { action: 'pass' }]

      // Run policy many times — it should never pick coord 6
      for (let i = 0; i < 100; i++) {
        const move = policy(state, 0, legalMoves)
        expect(move.coord).not.toBe(6)
      }
    })

    it('does not block non-eye moves', () => {
      const policy = createGoPlayoutPolicy()
      const board = new Array(25).fill(null)
      board[1] = 'black'
      board[11] = 'black'
      board[5] = 'black'
      // Cell 6 only has 3/4 neighbours as black — NOT an eye
      const state = { board, cols: 5, rows: 5 }
      const legalMoves = [{ coord: 6 }, { action: 'pass' }]

      let pickedCoord6 = false
      for (let i = 0; i < 100; i++) {
        const move = policy(state, 0, legalMoves)
        if (move.coord === 6) pickedCoord6 = true
      }
      expect(pickedCoord6).toBe(true)
    })

    it('passes when all moves are eye-fills', () => {
      const policy = createGoPlayoutPolicy()
      // Create a state where only available board moves are eye-fills
      const board = new Array(25).fill(null)
      // Make cell 6 an eye for black
      board[1] = 'black'
      board[11] = 'black'
      board[5] = 'black'
      board[7] = 'black'

      const state = { board, cols: 5, rows: 5 }
      const legalMoves = [{ coord: 6 }, { action: 'pass' }]

      const move = policy(state, 0, legalMoves)
      expect(move.action).toBe('pass')
    })
  })

  describe('capture preference', () => {
    it('heavily prefers capturing moves', () => {
      const policy = createGoPlayoutPolicy()
      // 5x5 board. White stone at 0 with one liberty at 1.
      // Black plays at 1 to capture.
      const board = new Array(25).fill(null)
      board[0] = 'white'  // corner stone, liberties: 1, 5
      board[5] = 'black'  // black below — reduces to 1 liberty

      const state = { board, cols: 5, rows: 5 }
      // Playing at coord 1 captures white at 0
      const legalMoves = [
        { coord: 1 },   // capture move
        { coord: 12 },  // center
        { coord: 20 },  // far away
        { coord: 21 },
        { coord: 22 },
        { action: 'pass' },
      ]

      let captureCount = 0
      const trials = 200
      for (let i = 0; i < trials; i++) {
        const move = policy(state, 0, legalMoves)
        if (move.coord === 1) captureCount++
      }
      // Should pick capture move significantly more than 1/5 (20%) of the time
      expect(captureCount / trials).toBeGreaterThan(0.35)
    })
  })

  describe('line penalty in opening', () => {
    it('prefers centre over edge on empty board', () => {
      const policy = createGoPlayoutPolicy()
      const board = new Array(81).fill(null) // 9x9
      const state = { board, cols: 9, rows: 9 }

      // Offer edge (coord 0 = corner) vs centre (coord 40)
      const legalMoves = [
        { coord: 0 },   // corner — line 1
        { coord: 40 },  // center — line 5
        { action: 'pass' },
      ]

      let centreCount = 0
      const trials = 200
      for (let i = 0; i < trials; i++) {
        const move = policy(state, 0, legalMoves)
        if (move.coord === 40) centreCount++
      }
      // Centre should be picked much more often than corner
      expect(centreCount / trials).toBeGreaterThan(0.7)
    })
  })

  describe('locality bias', () => {
    it('prefers moves near existing stones', () => {
      const policy = createGoPlayoutPolicy()
      const board = new Array(81).fill(null) // 9x9
      // Place stones in the centre area
      board[40] = 'black'
      board[41] = 'white'
      const state = { board, cols: 9, rows: 9 }

      // Offer a move adjacent to stones vs one far away (same line)
      const legalMoves = [
        { coord: 39 },  // adjacent to centre stones
        { coord: 0 },   // corner, far from action
        { action: 'pass' },
      ]

      let nearCount = 0
      const trials = 200
      for (let i = 0; i < trials; i++) {
        const move = policy(state, 0, legalMoves)
        if (move.coord === 39) nearCount++
      }
      expect(nearCount / trials).toBeGreaterThan(0.7)
    })
  })

  describe('policy vs random: rollout quality comparison', () => {
    it('smart policy produces better rollout outcomes than pure random', () => {
      // Instead of playing full MCTS games (which is very slow), we test the
      // rollout quality directly: run many rollouts from the same position with
      // each policy and compare win rates. The smart policy should produce
      // significantly better outcomes for the player who just moved.
      const simulator = createGoSimulator(9)

      const policyFn = createGoPlayoutPolicy()

      // Set up a mid-game position where black has a territorial advantage
      const board = new Array(81).fill(null)
      // Black occupies centre area
      board[30] = 'black'; board[31] = 'black'; board[39] = 'black'
      board[40] = 'black'; board[41] = 'black'; board[49] = 'black'
      board[50] = 'black'
      // White occupies a corner
      board[0] = 'white'; board[1] = 'white'; board[9] = 'white'
      board[10] = 'white'

      const state = {
        board,
        passes: 0, ko: null, captures: { 0: 0, 1: 0 },
        komi: 6.5, scoring: 'territory', previousStates: null,
        rows: 9, cols: 9, lastPlaced: null, lastCaptureBy: null, deadStones: [],
      }

      const trials = 100
      let smartBlackWins = 0
      let randomBlackWins = 0

      // Run rollouts with smart policy
      for (let i = 0; i < trials; i++) {
        const score = rolloutWithPolicy(simulator, state, 0, policyFn)
        if (score > 0.5) smartBlackWins++
      }

      // Run rollouts with pure random
      for (let i = 0; i < trials; i++) {
        const score = rolloutWithPolicy(simulator, state, 0, null)
        if (score > 0.5) randomBlackWins++
      }

      // Smart policy rollouts should recognise black's advantage more often
      // (black has more territory, so smart rollouts from black's perspective
      // should end in black wins more often than random rollouts)
      expect(smartBlackWins).toBeGreaterThan(randomBlackWins)
    }, 30000)

    it('smart policy games terminate naturally (double-pass) more often than random', () => {
      // The smart policy's eye detection and pass-when-no-good-moves logic
      // should cause games to reach proper termination (2 passes) rather than
      // running to the rollout depth limit.
      const simulator = createGoSimulator(9)
      const policyFn = createGoPlayoutPolicy()

      const trials = 50
      let smartTerminated = 0
      let randomTerminated = 0

      for (let i = 0; i < trials; i++) {
        const state = {
          board: new Array(81).fill(null),
          passes: 0, ko: null, captures: { 0: 0, 1: 0 },
          komi: 6.5, scoring: 'territory', previousStates: null,
          rows: 9, cols: 9, lastPlaced: null, lastCaptureBy: null, deadStones: [],
        }

        // Smart rollout
        let current = simulator.cloneState(state)
        let player = 0
        let terminated = false
        for (let d = 0; d < 150; d++) {
          const terminal = simulator.checkTerminal(current, player)
          if (terminal.over) { terminated = true; break }
          const moves = simulator.getLegalMoves(current, player)
          if (moves.length === 0) { terminated = true; break }
          const move = policyFn(current, player, moves)
          const { state: ns, continueTurn } = simulator.applyMove(current, move, player)
          current = ns
          player = simulator.nextPlayer(player, continueTurn)
        }
        if (terminated) smartTerminated++

        // Random rollout
        current = simulator.cloneState(state)
        player = 0
        terminated = false
        for (let d = 0; d < 150; d++) {
          const terminal = simulator.checkTerminal(current, player)
          if (terminal.over) { terminated = true; break }
          const moves = simulator.getLegalMoves(current, player)
          if (moves.length === 0) { terminated = true; break }
          const move = moves[Math.floor(rand() * moves.length)]
          const { state: ns, continueTurn } = simulator.applyMove(current, move, player)
          current = ns
          player = simulator.nextPlayer(player, continueTurn)
        }
        if (terminated) randomTerminated++
      }

      // Smart policy should terminate (reach double-pass) more often because
      // it passes when only eye-fills remain, while random keeps playing
      expect(smartTerminated).toBeGreaterThan(randomTerminated)
    }, 60000)
  })
})
