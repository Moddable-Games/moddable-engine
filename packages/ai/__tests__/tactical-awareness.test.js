/**
 * Tactical awareness fixtures.
 * Verifies quiescence search detects hanging pieces and avoids material loss.
 */
import { createMinimax } from '../src/minimax.js'
import { createSimulator } from '../src/simulator.js'
import { EVALUATORS } from '../src/evaluators.js'
import { createChessPlugin } from '../../plugins/chess/index.js'
import { createGameFromDefinition } from '../../game/index.js'
import { createGridTopology } from '../../topologies/grid/index.js'

function setup(fen, opts = {}) {
  const game = createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: { setup: fen, castling: opts.castling ?? false, enPassant: opts.enPassant ?? false } },
    },
    {
      topologies: { grid: c => createGridTopology(c) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin(cfg, ctx) },
    }
  )
  const plugin = game.registry.getPlugins().find(p => p.sliceName === 'chess')
  const sim = createSimulator(plugin, { playerCount: 2, playerNames: ['white', 'black'], evaluate: EVALUATORS.chess })
  return { game, sim }
}

function bestMove(sim, state, player, timeMs = 2000) {
  const engine = createMinimax(sim, { timeLimit: timeMs, depth: 50, topN: 1, spread: 0 })
  return engine.search(state, player)
}

function sq(name) {
  const col = name.charCodeAt(0) - 97
  const row = 8 - parseInt(name[1])
  return row * 8 + col
}

describe('Tactical awareness — quiescence', () => {

  it('queen attacked by pawn: moves queen when undefended', () => {
    // Queen on a5 attacked by pawn on b4. No defender. Must move.
    const { sim, game } = setup('4k3/8/8/q7/1P6/8/8/4K3')
    const move = bestMove(sim, game.getState('chess'), 1)
    expect(move.from).toBe(sq('a5'))
  })

  it('queen attacked by pawn: does not stay on attacked square', () => {
    // Queen on a5 attacked by pawn on b4. Must move (Qxb4 or retreat).
    const { sim, game } = setup('4k3/8/8/q7/1P6/8/8/4K3')
    const move = bestMove(sim, game.getState('chess'), 1)
    expect(move.from).toBe(sq('a5'))
  })

  it('does not sacrifice knight for pawn (defended piece)', () => {
    // White knight on d5 defended by pawn c4. Black pawn e6 attacks d5.
    // Nxe6?? is bad if defended. Actually just test: white shouldn't LOSE the knight.
    // Simpler: knight on c3 attacked by nothing, pawn on d2 defends.
    // Use a position where trading is clearly bad:
    // White: Ke1, Nd5, Pc4. Black: Ke8, Pe6, Pd6.
    // Nxe6 dxe6 loses knight(320) for pawn(100). AI should not play Nxe6.
    const { sim, game } = setup('4k3/8/3pp3/3N4/2P5/8/8/4K3')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Knight is on d5 = row3,col3 = 27. e6 = row2,col4 = 20.
    // Should NOT capture e6 because d6 pawn recaptures (losing exchange).
    if (move.from === 27) {
      expect(move.to).not.toBe(20)
    }
  })

  it('hanging piece: does not leave a rook en prise', () => {
    // White rook on d4 attacked by black pawn on e5. No white defender of d4.
    // Black pawn on c5 also attacks d4. White must move the rook.
    // Position chosen so king has no improving move — rook must act.
    const { sim, game } = setup('4k3/8/8/2p1p3/3R4/8/8/3K4')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Rook should move (from d4 = idx 27)
    expect(move.from).toBe(sq('d4'))
  })

  it('wins free piece: takes undefended knight', () => {
    // White queen on e2, black knight on b5 undefended, king on a8 far away.
    // Queen reaches b5 diagonally; king can't defend b5 or be captured.
    const { sim, game } = setup('k7/8/8/1n6/8/8/4Q3/4K3')
    const engine = createMinimax(sim, { timeLimit: 2000, depth: 3, topN: 1, spread: 0 })
    const move = engine.search(game.getState('chess'), 0)
    expect(move.to).toBe(sq('b5'))
  })
})

describe('Tactical awareness — declining captures (stand-pat)', () => {

  it('does not capture into a losing recapture', () => {
    // White knight on e4. Black rook on d4, defended by black queen on d8.
    // Nxd4?? loses the knight to Qxd4. The knight should stay or move elsewhere.
    const { sim, game } = setup('3q4/8/8/8/3rN3/8/8/4K2k')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Knight is on e4 = row4,col4 = idx 36. Rook on d4 = row4,col3 = idx 35.
    // If it captures, from=36, to=35. It should NOT do this.
    if (move.from === 36) {
      expect(move.to).not.toBe(35)
    }
  })

  it('prefers standing pat over capturing defended queen with rook', () => {
    // White rook on a1. Black queen on a8 defended by black rook on h8.
    // Rxa8?? loses the exchange (Rxh8 would recapture... actually Rxa8 Rxa8 is fine).
    // Better: white rook on d1. Black queen on d8 defended by both rooks (a8, h8).
    // Rxd8 Rxd8 loses rook for queen — that's actually GOOD.
    // Let me use: White bishop b3, black pawn c4 defended by black pawn d5.
    // Bxc4?? dxc4 loses a bishop for a pawn. Should decline.
    const { sim, game } = setup('4k3/8/8/3p4/2p5/1B6/8/4K3')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Bishop is on b3 = row5,col1 = idx 41. c4 = row4,col2 = idx 34.
    // Bxc4? dxc4 loses bishop(330) for pawn(100). Should not take.
    if (move.from === 41) {
      expect(move.to).not.toBe(34)
    }
  })
})

describe('Tactical awareness — mate preference', () => {

  it('prefers mate-in-one over capturing a queen', () => {
    // Back-rank mate: White rook d1, black king g8 with pawns f7,g7,h7 blocking escape.
    // Black queen on a2 is free. Rd8# is checkmate. Rxa2 takes queen but doesn't mate.
    // 6k1/5ppp/8/8/8/8/q7/3R2K1
    // Rook d1 (59), king g1 (62). Black king g8 (6), pawns f7(13),g7(14),h7(15).
    // Rd8# = rook to d8 (3). King can't escape: f8(5) not attacked by Rd8?
    // d8 rook attacks along rank 8: a8-h8. g8 is on rank 8! So Rd8+ checks.
    // King escapes: f8(5)? Not on d-file or 8th rank from rook perspective...
    // Actually Rd8 only attacks d-file and rank 8 (row 0). f8 is on rank 8!
    // Rook on d8 attacks whole rank 0. f8=5 IS attacked. h8=7 IS attacked.
    // g7 pawn blocks g7. f7 pawn blocks f7. So king has NO escape. Rd8#.
    const { sim, game } = setup('6k1/5ppp/8/8/8/8/q7/3R2K1')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Rd8# = rook d1(59) to d8(3). Must prefer over Rxa2? No, Rd1 can't reach a2.
    // Actually rook CAN go to a1(56) taking queen... no, a2 is idx 48. Rook on d1(59)
    // can go along rank 1: a1(56),b1(57),c1(58),e1(60)... and d-file up.
    // But queen is on a2 (48) not a1. Rook can't reach a2 in one move (different file AND rank).
    // So the only good move is Rd8#. Let's just verify it's the one chosen.
    expect(move.from).toBe(59)
    expect(move.to).toBe(3)
  })
})

describe('Tactical awareness — simple captures', () => {

  it('takes free piece: captures undefended bishop', () => {
    // White bishop on d4 undefended. Black queen on a7 can take it.
    // Depth-limited to test material capture, not deep mating sequences.
    const { sim, game } = setup('4k3/q7/8/8/3B4/8/8/4K3')
    const engine = createMinimax(sim, { timeLimit: 2000, depth: 3, topN: 1, spread: 0 })
    const move = engine.search(game.getState('chess'), 1)
    expect(move.to).toBe(sq('d4'))
    expect(move.capture).toBe(true)
  })

  it('does not trade queen for pawn', () => {
    // White queen on d4, black pawn on e5 defended by pawn on d6.
    // Qxe5 loses the queen to dxe5. AI should not play Qxe5.
    const { sim, game } = setup('4k3/8/3p4/4p3/3Q4/8/8/4K3')
    const move = bestMove(sim, game.getState('chess'), 0)
    // Should NOT capture on e5
    if (move.from === sq('d4')) {
      expect(move.to).not.toBe(sq('e5'))
    }
  })
})
