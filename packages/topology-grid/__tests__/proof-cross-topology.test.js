import { createGridTopology } from '../index.js'
import { createHexTopology } from '../../topology-hex/index.js'
import { slide, leap } from '../../piece-behaviour/index.js'
import { bindTraversal } from '../../core/src/bind-traversal.js'

/**
 * Proof: the same piece movement logic works on different topologies.
 *
 * A "rook" slides along orthogonal directions.
 * A "knight" leaps to knight-pattern positions.
 *
 * The movement code never references coordinates — it uses category names.
 * The topology resolves those names to its own geometry.
 */

function genRookMoves(topology, from, board) {
  const rays = topology.rays(from, 'orthogonal')
  return slide(rays, from, board)
}

function genBishopMoves(topology, from, board) {
  const rays = topology.rays(from, 'diagonal')
  return slide(rays, from, board)
}

const GRID_KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
const HEX_KNIGHT_OFFSETS = [
  { q: 2, r: -1 }, { q: 1, r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 1 },
  { q: 2, r: 1 }, { q: 1, r: 2 }, { q: -1, r: 1 },
  { q: -2, r: -1 }, { q: -1, r: -2 }, { q: 1, r: -1 },
]

function genKnightMoves(topology, from, board, knightOffsets) {
  const targets = topology.leapTargets(from, knightOffsets)
  return leap(targets, from, board)
}

describe('proof: cross-topology piece movement', () => {
  describe('rook on 8x8 grid', () => {
    const topology = createGridTopology({ rows: 8, cols: 8 })
    const emptyBoard = new Array(64).fill(null)

    it('slides along 4 orthogonal directions', () => {
      const from = topology.toIndex(3, 3) // center-ish
      const moves = genRookMoves(topology, from, emptyBoard)
      expect(moves.length).toBe(14) // 7 + 7 horizontal/vertical but bounded
    })

    it('blocked by pieces', () => {
      const board = [...emptyBoard]
      const from = topology.toIndex(3, 3)
      board[topology.toIndex(3, 5)] = { friendly: true }
      const moves = genRookMoves(topology, from, board)
      const rightMoves = moves.filter(m => m.to > from && m.to < from + 8)
      expect(rightMoves.length).toBe(1) // only 3,4 (blocked at 3,5)
    })
  })

  describe('rook on hex board (6 orthogonal directions)', () => {
    const topology = createHexTopology({ radius: 4 })
    const board = {}

    it('slides along 6 edge-to-edge directions', () => {
      const from = '0,0' // center
      const moves = genRookMoves(topology, from, board)
      // 6 directions, each ray extends to radius (4 cells)
      expect(moves.length).toBe(24) // 6 * 4
    })

    it('blocked by pieces on hex', () => {
      const blockedBoard = { '1,0': { friendly: true } }
      const from = '0,0'
      const moves = genRookMoves(topology, from, blockedBoard)
      // One direction blocked at distance 1, other 5 still have 4 each
      expect(moves.length).toBe(20) // 5*4 + 0 from blocked direction
    })
  })

  describe('bishop on grid (4 diagonals) vs hex (6 diagonals)', () => {
    it('grid bishop: 4 diagonal directions', () => {
      const topology = createGridTopology({ rows: 8, cols: 8 })
      const from = topology.toIndex(3, 3)
      const moves = genBishopMoves(topology, from, new Array(64).fill(null))
      expect(moves.length).toBe(13) // standard bishop from d5
    })

    it('hex bishop: 6 vertex-to-vertex directions', () => {
      const topology = createHexTopology({ radius: 4 })
      const moves = genBishopMoves(topology, '0,0', {})
      // Diagonals on hex skip cells — not all targets may be on board
      expect(moves.length).toBeGreaterThan(0)
    })
  })

  describe('knight on grid vs hex (offsets from plugin config)', () => {
    it('grid knight: plugin provides L-shaped offsets', () => {
      const topology = createGridTopology({ rows: 8, cols: 8 })
      const from = topology.toIndex(3, 3)
      const moves = genKnightMoves(topology, from, new Array(64).fill(null), GRID_KNIGHT_OFFSETS)
      expect(moves.length).toBe(8)
    })

    it('hex knight: plugin provides hex-specific offsets', () => {
      const topology = createHexTopology({ radius: 4 })
      const moves = genKnightMoves(topology, '0,0', {}, HEX_KNIGHT_OFFSETS)
      expect(moves.length).toBe(12)
    })

    it('hex knight from edge has fewer targets (offsets off board)', () => {
      const topology = createHexTopology({ radius: 3 })
      const edgeCell = '3,0'
      const moves = genKnightMoves(topology, edgeCell, {}, HEX_KNIGHT_OFFSETS)
      expect(moves.length).toBeLessThan(12)
    })
  })

  describe('same function, zero code difference', () => {
    it('genRookMoves source code is topology-agnostic', () => {
      // This test verifies the contract: the SAME function produces valid
      // moves on both topologies without any topology-specific branching
      const gridTopo = createGridTopology({ rows: 5, cols: 5 })
      const hexTopo = createHexTopology({ radius: 3 })

      const gridMoves = genRookMoves(gridTopo, gridTopo.toIndex(2, 2), new Array(25).fill(null))
      const hexMoves = genRookMoves(hexTopo, '0,0', {})

      expect(gridMoves.length).toBeGreaterThan(0)
      expect(hexMoves.length).toBeGreaterThan(0)
      // Both return {from, to} objects — same shape
      expect(gridMoves[0]).toHaveProperty('from')
      expect(gridMoves[0]).toHaveProperty('to')
      expect(hexMoves[0]).toHaveProperty('from')
      expect(hexMoves[0]).toHaveProperty('to')
    })
  })

  describe('Go uses only neighbours — works on any topology', () => {
    it('group detection works on grid', () => {
      const topology = createGridTopology({ rows: 5, cols: 5 })
      bindTraversal(topology)
      const board = new Map([[0, 'b'], [1, 'b'], [5, 'b']])
      const { group } = topology.getGroup(0, c => board.get(c) === 'b')
      expect(group.size).toBe(3)
    })

    it('group detection works on hex with identical call', () => {
      const topology = createHexTopology({ radius: 3 })
      bindTraversal(topology)
      const board = new Map([['0,0', 'b'], ['1,0', 'b'], ['0,1', 'b']])
      const { group } = topology.getGroup('0,0', c => board.get(c) === 'b')
      expect(group.size).toBe(3)
    })
  })
})
