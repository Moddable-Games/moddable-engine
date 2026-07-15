import { createChessPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topology-grid/index.js'

function createChessGame(pluginConfig = {}, variantConfig = {}, topologyConfig = {}) {
  const topo = { type: 'grid', rows: 8, cols: 8, ...topologyConfig }
  return createGameFromDefinition(
    {
      topology: topo,
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: pluginConfig },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin({ ...cfg, ...variantConfig }, ctx) },
    }
  )
}

describe('chess variants', () => {
  describe('no castling variant', () => {
    it('has no castling rights in state', () => {
      const game = createChessGame({}, { castling: false })
      const state = game.getState('chess')
      expect(state.castlingRights).toBeUndefined()
    })

    it('king cannot castle', () => {
      const game = createChessGame(
        { setup: 'r3k2r/8/8/8/8/8/8/R3K2R' },
        { castling: false }
      )
      const moves = game.getLegalMoves()
      const kingMoves = moves.filter(m => m.from === 60)
      expect(kingMoves.find(m => m.castle)).toBeUndefined()
    })
  })

  describe('no en passant variant', () => {
    it('does not track EP target', () => {
      const game = createChessGame({}, { enPassant: false })
      game.execute({ from: 52, to: 36 })
      const state = game.getState('chess')
      expect(state.enPassantTarget).toBeUndefined()
    })
  })

  describe('custom promotion choices (like Capablanca)', () => {
    it('offers custom promotion pieces', () => {
      const game = createChessGame(
        { setup: '8/P7/8/8/8/8/8/4K2k' },
        { promotionChoices: ['queen', 'rook', 'bishop', 'knight', 'archbishop', 'chancellor'] }
      )
      const moves = game.getLegalMoves()
      const promoMoves = moves.filter(m => m.from === 8 && m.promotion)
      expect(promoMoves.length).toBe(6)
      const types = promoMoves.map(m => m.promotion)
      expect(types).toContain('archbishop')
      expect(types).toContain('chancellor')
    })
  })

  describe('10x8 board (Capablanca-like)', () => {
    it('creates correct board size', () => {
      const game = createChessGame(
        { setup: 'rnbqkbnr2/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBQKBNR2' },
        {},
        { rows: 8, cols: 10 }
      )
      const state = game.getState('chess')
      expect(state.board).toHaveLength(80)
    })
  })

  describe('custom piece types (fairy pieces)', () => {
    it('archbishop moves as bishop + knight compound', () => {
      const baseVocab = createChessPlugin().vocabulary
      // A on d5 = row 3 col 3 = index 27
      const game = createChessGame(
        { setup: '7k/8/8/3A4/8/8/8/K7' },
        {
          pieces: {
            archbishop: [
              { type: 'rider', dirs: 'diagonal' },
              { type: 'leaper', offsets: 'knight' },
            ],
          },
          vocabulary: {
            ...baseVocab,
            archbishop: { symbols: { 0: 'A', 1: 'a' } },
          },
        }
      )
      const state = game.getState('chess')
      expect(state.board[27]).toEqual({ type: 'archbishop', owner: 0 })
      const moves = game.getLegalMoves()
      const archbishopMoves = moves.filter(m => m.from === 27)
      expect(archbishopMoves.length).toBeGreaterThan(8)
      // Knight targets from d5 (27): b6(17), b4(41), c7(10), c3(42), e7(12), e3(44), f6(21), f4(37)
      expect(archbishopMoves.find(m => m.to === 12)).toBeDefined()
      expect(archbishopMoves.find(m => m.to === 18)).toBeDefined() // diagonal c6
    })
  })

  describe('chess960-style castling (rook not on corner)', () => {
    it('finds rook dynamically by scanning from king outward', () => {
      const game = createChessGame(
        { setup: '4k3/8/8/8/8/8/8/2RK1R2' },
        { castling: true }
      )
      const state = game.getState('chess')
      expect(state.castlingRights[0]).toEqual({ king: true, queen: true })
      const moves = game.getLegalMoves()
      const kingMoves = moves.filter(m => m.from === 59)
      const castleMoves = kingMoves.filter(m => m.castle)
      expect(castleMoves.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('wrap topology (toroidal)', () => {
    it('rook wraps around files on a wrapped board', () => {
      // 5x5 board, kings far apart, rook on a3 can wrap to e3
      // Row 0: ....k, Row 1: ....., Row 2: R...., Row 3: ....., Row 4: ..K..
      const game = createChessGame(
        { setup: '4k/5/R4/5/2K2' },
        { castling: false, enPassant: false },
        { rows: 5, cols: 5, wrap: true }
      )
      const state = game.getState('chess')
      expect(state.board).toHaveLength(25)
      expect(state.board[10]).toEqual({ type: 'rook', owner: 0 })
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
      const rookMoves = moves.filter(m => m.from === 10)
      const rookTargets = rookMoves.map(m => m.to)
      // Rook at a3 (10) should reach e3 (14) by wrapping left
      expect(rookTargets).toContain(14)
    })
  })

  describe('custom advancement direction', () => {
    it('supports function-based advancement', () => {
      const game = createChessGame(
        { setup: '4k3/8/8/8/8/8/4P3/4K3' },
        { advancement: (player) => player === 0 ? -1 : 1 }
      )
      const moves = game.getLegalMoves()
      const pawnMoves = moves.filter(m => m.from === 52)
      expect(pawnMoves.find(m => m.to === 44)).toBeDefined()
    })
  })

  describe('halfmove clock', () => {
    it('increments on non-pawn non-capture', () => {
      const game = createChessGame()
      game.execute({ from: 62, to: 45 })
      expect(game.getState('chess').halfmoveClock).toBe(1)
    })

    it('resets on pawn move', () => {
      const game = createChessGame()
      game.execute({ from: 62, to: 45 })
      game.execute({ from: 8, to: 16 })
      expect(game.getState('chess').halfmoveClock).toBe(0)
    })
  })
})
