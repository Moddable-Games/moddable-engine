import { createHexTopology } from '../../../topology-hex/index.js'
import { createGridTopology } from '../../../topology-grid/index.js'
import { bindTraversal } from '../../../core/src/bind-traversal.js'
import { rider, leaper, compose } from '../../../piece-behaviour/index.js'

/**
 * Proof: Glinski's Hexagonal Chess
 *
 * Chess pieces on a 91-cell hex board (radius 5).
 * Rook slides 6 orthogonal directions (hex edges).
 * Bishop slides 6 diagonal directions (hex vertices).
 * Knight leaps to 12 hex-knight targets.
 * King moves 1 step in any of 12 directions.
 *
 * This test proves the cross-topology architecture works:
 * the same piece-behaviour primitives, different topology.
 */

const HEX_KNIGHT_OFFSETS = [
  { q: 2, r: -1 }, { q: 1, r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 1 },
  { q: 2, r: 1 }, { q: 1, r: 2 }, { q: -1, r: 1 },
  { q: -2, r: -1 }, { q: -1, r: -2 }, { q: 1, r: -1 },
]

describe('proof: Glinski hexagonal chess', () => {
  const topology = createHexTopology({ radius: 5, shape: 'hexagonal' })

  describe('hex topology basics', () => {
    it('creates 91-cell hexagonal board', () => {
      expect(topology.getCellCount()).toBe(91)
    })

    it('centre cell has 6 orthogonal neighbours', () => {
      const neighbours = topology.neighbours('0,0')
      expect(neighbours).toHaveLength(6)
    })

    it('rook from centre has 6 rays of length 5', () => {
      const rays = topology.rays('0,0', 'orthogonal')
      expect(rays).toHaveLength(6)
      expect(rays[0]).toHaveLength(5)
    })

    it('bishop from centre has 6 diagonal rays', () => {
      const rays = topology.rays('0,0', 'diagonal')
      expect(rays).toHaveLength(6)
    })

    it('knight from centre has 12 leap targets', () => {
      const targets = topology.leapTargets('0,0', HEX_KNIGHT_OFFSETS)
      expect(targets).toHaveLength(12)
    })

    it('knight from edge has fewer targets', () => {
      const targets = topology.leapTargets('5,0', HEX_KNIGHT_OFFSETS)
      expect(targets.length).toBeLessThan(12)
    })
  })

  describe('piece movement on hex via piece-behaviour', () => {
    it('rook generates 30 moves from centre of empty board', () => {
      const rook = rider('orthogonal')
      const board = {}
      const moves = rook.genMoves(topology, '0,0', board)
      expect(moves.length).toBe(30)
    })

    it('rook blocked by friendly piece', () => {
      const rook = rider('orthogonal')
      const board = { '1,0': { friendly: true, type: 'pawn', owner: 0 } }
      const moves = rook.genMoves(topology, '0,0', board)
      expect(moves.length).toBe(25)
    })

    it('rook captures enemy piece and stops', () => {
      const rook = rider('orthogonal')
      const board = { '2,0': { friendly: false, enemy: true, type: 'pawn', owner: 1 } }
      const moves = rook.genMoves(topology, '0,0', board)
      const captureMove = moves.find(m => m.to === '2,0')
      expect(captureMove).toBeDefined()
      expect(captureMove.capture).toBe(true)
      expect(moves.find(m => m.to === '3,0')).toBeUndefined()
    })

    it('knight generates 12 moves from centre', () => {
      const knight = leaper(HEX_KNIGHT_OFFSETS)
      const board = {}
      const moves = knight.genMoves(topology, '0,0', board)
      expect(moves).toHaveLength(12)
    })

    it('queen (rook + bishop compound) covers all 12 directions', () => {
      const queen = compose(rider('orthogonal'), rider('diagonal'))
      const board = {}
      const moves = queen.genMoves(topology, '0,0', board)
      expect(moves.length).toBeGreaterThan(30)
    })

    it('king moves 1 step in all 12 directions from centre', () => {
      const king = rider('all', { maxSteps: 1 })
      const board = {}
      const moves = king.genMoves(topology, '0,0', board)
      expect(moves).toHaveLength(12)
    })
  })

  describe('attack detection on hex', () => {
    it('rook attacks along hex orthogonal ray', () => {
      const rook = rider('orthogonal')
      const board = {}
      expect(rook.attacks(topology, '0,0', '3,0', board)).toBe(true)
      expect(rook.attacks(topology, '0,0', '0,4', board)).toBe(true)
    })

    it('rook does not attack diagonally', () => {
      const rook = rider('orthogonal')
      const board = {}
      expect(rook.attacks(topology, '0,0', '2,-1', board)).toBe(false)
    })

    it('knight attacks hex-knight targets only', () => {
      const knight = leaper(HEX_KNIGHT_OFFSETS)
      expect(knight.attacks(topology, '0,0', '2,-1')).toBe(true)
      expect(knight.attacks(topology, '0,0', '1,0')).toBe(false)
    })

    it('rook attack blocked by intervening piece', () => {
      const rook = rider('orthogonal')
      const board = { '1,0': { friendly: false, enemy: true, type: 'pawn', owner: 1 } }
      expect(rook.attacks(topology, '0,0', '3,0', board)).toBe(false)
    })

    it('bishop attacks along hex diagonal ray', () => {
      const bishop = rider('diagonal')
      const board = {}
      expect(bishop.attacks(topology, '0,0', '2,-1', board)).toBe(true)
      expect(bishop.attacks(topology, '0,0', '1,0', board)).toBe(false)
    })
  })

  describe('cross-topology proof: same code, different geometry', () => {
    it('identical rider("orthogonal") works on both grid and hex', () => {
      const gridTopo = createGridTopology({ rows: 8, cols: 8 })
      const hexTopo = topology

      const rook = rider('orthogonal')
      const gridMoves = rook.genMoves(gridTopo, 27, new Array(64).fill(null))
      const hexMoves = rook.genMoves(hexTopo, '0,0', {})

      expect(gridMoves.length).toBe(14)
      expect(hexMoves.length).toBe(30)
      expect(gridMoves[0]).toHaveProperty('from', 27)
      expect(hexMoves[0]).toHaveProperty('from', '0,0')
    })
  })
})
