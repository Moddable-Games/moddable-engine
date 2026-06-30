import { rider, leaper, compose, divergent, fromConfig, OFFSETS } from '../index.js'
import { createGridTopology } from '../../topology-grid/index.js'

const topology = createGridTopology({ rows: 8, cols: 8 })

function makeBoard(pieces = {}) {
  const board = new Array(64).fill(null)
  for (const [pos, piece] of Object.entries(pieces)) {
    board[parseInt(pos)] = piece
  }
  return board
}

const friendly = { friendly: true, enemy: false, type: 'pawn', owner: 0 }
const enemy = { friendly: false, enemy: true, type: 'pawn', owner: 1 }

describe('piece-definitions', () => {
  describe('OFFSETS', () => {
    it('has standard named offset sets', () => {
      expect(OFFSETS.knight).toHaveLength(8)
      expect(OFFSETS.king).toHaveLength(8)
      expect(OFFSETS.bishop).toHaveLength(4)
      expect(OFFSETS.rook).toHaveLength(4)
      expect(OFFSETS.queen).toHaveLength(8)
      expect(OFFSETS.elephant).toHaveLength(4)
      expect(OFFSETS.camel).toHaveLength(8)
      expect(OFFSETS.dabbaba).toHaveLength(4)
      expect(OFFSETS.zebra).toHaveLength(8)
    })
  })

  describe('rider', () => {
    it('generates sliding moves along rays', () => {
      const rook = rider('orthogonal')
      const board = makeBoard()
      const moves = rook.genMoves(topology, 27, board) // d4
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.from === 27)).toBe(true)
    })

    it('stops at friendly pieces', () => {
      const rook = rider('orthogonal')
      const board = makeBoard({ 19: friendly }) // d3 blocked by friendly
      const moves = rook.genMoves(topology, 27, board)
      const upMoves = moves.filter(m => m.to === 19 || m.to === 11 || m.to === 3)
      expect(upMoves).toHaveLength(0)
    })

    it('captures enemy and stops', () => {
      const rook = rider('orthogonal')
      const board = makeBoard({ 19: enemy })
      const moves = rook.genMoves(topology, 27, board)
      const capture = moves.find(m => m.to === 19)
      expect(capture).toBeDefined()
      expect(capture.capture).toBe(true)
      expect(moves.find(m => m.to === 11)).toBeUndefined()
    })

    it('attacks detects threats through empty squares', () => {
      const rook = rider('orthogonal')
      const board = makeBoard()
      expect(rook.attacks(topology, 27, 3, board)).toBe(true) // d4 attacks d8
      expect(rook.attacks(topology, 27, 0, board)).toBe(false) // d4 does not attack a8
    })

    it('attacks blocked by intervening piece', () => {
      const rook = rider('orthogonal')
      const board = makeBoard({ 19: enemy })
      expect(rook.attacks(topology, 27, 11, board)).toBe(false) // blocked
    })

    it('respects maxSteps', () => {
      const king = rider('all', { maxSteps: 1 })
      const board = makeBoard()
      const moves = king.genMoves(topology, 27, board)
      expect(moves).toHaveLength(8) // king in center has 8 moves
      expect(moves.every(m => topology.chebyshev(27, m.to) === 1)).toBe(true)
    })
  })

  describe('leaper', () => {
    it('generates knight moves', () => {
      const knight = leaper('knight')
      const board = makeBoard()
      const moves = knight.genMoves(topology, 27, board) // d4
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.from === 27)).toBe(true)
    })

    it('skips friendly-occupied squares', () => {
      const knight = leaper('knight')
      const board = makeBoard({ 12: friendly }) // target occupied by friend
      const moves = knight.genMoves(topology, 27, board)
      expect(moves.find(m => m.to === 12)).toBeUndefined()
    })

    it('captures enemy on target', () => {
      const knight = leaper('knight')
      const board = makeBoard({ 12: enemy })
      const moves = knight.genMoves(topology, 27, board)
      const capture = moves.find(m => m.to === 12)
      expect(capture).toBeDefined()
      expect(capture.capture).toBe(true)
    })

    it('attacks checks if target is reachable', () => {
      const knight = leaper('knight')
      expect(knight.attacks(topology, 27, 12)).toBe(true) // d4 → e2 is valid knight
      expect(knight.attacks(topology, 27, 28)).toBe(false) // d4 → e4 is not
    })

    it('works with raw offset arrays', () => {
      const customLeaper = leaper([[1, 2], [-1, -2]])
      const board = makeBoard()
      const moves = customLeaper.genMoves(topology, 27, board)
      expect(moves.length).toBe(2)
    })
  })

  describe('compose', () => {
    it('combines rider and leaper (archbishop = bishop + knight)', () => {
      const archbishop = compose(rider('diagonal'), leaper('knight'))
      const board = makeBoard()
      const moves = archbishop.genMoves(topology, 27, board)
      const knightMoves = leaper('knight').genMoves(topology, 27, board)
      const bishopMoves = rider('diagonal').genMoves(topology, 27, board)
      expect(moves.length).toBe(knightMoves.length + bishopMoves.length)
    })

    it('attacks via either component', () => {
      const archbishop = compose(rider('diagonal'), leaper('knight'))
      const board = makeBoard()
      expect(archbishop.attacks(topology, 27, 0, board)).toBe(true) // diagonal
      expect(archbishop.attacks(topology, 27, 12, board)).toBe(true) // knight
      expect(archbishop.attacks(topology, 27, 19, board)).toBe(false) // neither
    })
  })

  describe('divergent', () => {
    it('moves with one primitive, captures with another', () => {
      const yurt = divergent(leaper('bishop'), leaper('rook'))
      const board = makeBoard({ 26: enemy }) // enemy adjacent orthogonally
      const moves = yurt.genMoves(topology, 27, board)
      const quietMoves = moves.filter(m => !m.capture)
      const captures = moves.filter(m => m.capture)
      // quiet moves should be diagonal leaps only
      for (const m of quietMoves) {
        const [r1, c1] = topology.toRC(27)
        const [r2, c2] = topology.toRC(m.to)
        expect(Math.abs(r1 - r2)).toBe(1)
        expect(Math.abs(c1 - c2)).toBe(1)
      }
      // captures should be orthogonal leaps only
      expect(captures.find(m => m.to === 26)).toBeDefined()
    })

    it('attacks uses capture primitive only', () => {
      const yurt = divergent(leaper('bishop'), leaper('rook'))
      const board = makeBoard()
      expect(yurt.attacks(topology, 27, 26)).toBe(true) // orthogonal = capture primitive
      expect(yurt.attacks(topology, 27, 18)).toBe(false) // diagonal = move primitive only
    })
  })

  describe('fromConfig', () => {
    it('builds a rider from config', () => {
      const piece = fromConfig({ type: 'rider', dirs: 'orthogonal' })
      expect(piece.type).toBe('rider')
      const board = makeBoard()
      expect(piece.genMoves(topology, 27, board).length).toBeGreaterThan(0)
    })

    it('builds a leaper from config', () => {
      const piece = fromConfig({ type: 'leaper', offsets: 'knight' })
      expect(piece.type).toBe('leaper')
    })

    it('builds compound from array config', () => {
      const piece = fromConfig([
        { type: 'rider', dirs: 'orthogonal' },
        { type: 'leaper', offsets: 'knight' },
      ])
      expect(piece.type).toBe('compound')
    })

    it('builds divergent from config', () => {
      const piece = fromConfig({
        divergent: {
          move: { type: 'rider', dirs: 'diagonal' },
          capture: { type: 'leaper', offsets: 'knight' },
        },
      })
      expect(piece.type).toBe('divergent')
    })

    it('rider with maxSteps from config', () => {
      const piece = fromConfig({ type: 'rider', dirs: 'all', maxSteps: 1 })
      const board = makeBoard()
      const moves = piece.genMoves(topology, 27, board)
      expect(moves).toHaveLength(8) // king-like
    })
  })
})
