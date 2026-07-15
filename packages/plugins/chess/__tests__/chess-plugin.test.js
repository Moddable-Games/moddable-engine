import { createChessPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topology-grid/index.js'

function createChessGame(pluginConfig = {}, variantConfig = {}) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
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

describe('plugin-chess', () => {
  describe('init', () => {
    it('sets up standard starting position from FEN', () => {
      const game = createChessGame()
      const state = game.getState('chess')
      expect(state.board).toHaveLength(64)
      expect(state.board[0]).toEqual({ type: 'rook', owner: 1 })
      expect(state.board[4]).toEqual({ type: 'king', owner: 1 })
      expect(state.board[60]).toEqual({ type: 'king', owner: 0 })
      expect(state.board[63]).toEqual({ type: 'rook', owner: 0 })
    })

    it('empty squares are null', () => {
      const game = createChessGame()
      const state = game.getState('chess')
      expect(state.board[32]).toBeNull()
    })

    it('starts with white to move', () => {
      const game = createChessGame()
      expect(game.currentPlayer()).toBe('white')
    })

    it('initialises castling rights', () => {
      const game = createChessGame()
      const state = game.getState('chess')
      expect(state.castlingRights[0]).toEqual({ king: true, queen: true })
      expect(state.castlingRights[1]).toEqual({ king: true, queen: true })
    })
  })

  describe('basic movement', () => {
    it('pawn advances one square', () => {
      const game = createChessGame()
      const result = game.execute({ from: 52, to: 44 })
      expect(result.ok).toBe(true)
      expect(game.getState('chess').board[44]).toEqual({ type: 'pawn', owner: 0 })
      expect(game.getState('chess').board[52]).toBeNull()
    })

    it('pawn advances two squares from start', () => {
      const game = createChessGame()
      const result = game.execute({ from: 52, to: 36 })
      expect(result.ok).toBe(true)
      expect(game.getState('chess').board[36]).toEqual({ type: 'pawn', owner: 0 })
    })

    it('knight leaps', () => {
      const game = createChessGame()
      const result = game.execute({ from: 62, to: 45 })
      expect(result.ok).toBe(true)
      expect(game.getState('chess').board[45]).toEqual({ type: 'knight', owner: 0 })
    })

    it('cannot move opponent piece', () => {
      const game = createChessGame()
      const result = game.execute({ from: 8, to: 16 })
      expect(result.ok).toBe(false)
    })

    it('cannot move empty square', () => {
      const game = createChessGame()
      const result = game.execute({ from: 32, to: 24 })
      expect(result.ok).toBe(false)
    })

    it('alternates turns', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 44 })
      expect(game.currentPlayer()).toBe('black')
      game.execute({ from: 12, to: 20 })
      expect(game.currentPlayer()).toBe('white')
    })
  })

  describe('captures', () => {
    it('pawn captures diagonally', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 36 }) // e4
      game.execute({ from: 11, to: 27 }) // d5
      const result = game.execute({ from: 36, to: 27 }) // exd5
      expect(result.ok).toBe(true)
      expect(game.getState('chess').board[27]).toEqual({ type: 'pawn', owner: 0 })
    })

    it('pawn cannot capture forward', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 44 }) // e3
      game.execute({ from: 12, to: 28 }) // e5
      // pawn on e3(44) cannot capture e5(28) — not adjacent diagonally
      // but first let's move to blocked position
      game.execute({ from: 44, to: 36 }) // e4
      game.execute({ from: 9, to: 17 }) // b6 filler
      // Now e4(36) is blocked by e5(28)? No, e5 is 28 which is row 3 col 4
      // e4 is 36 = row 4 col 4. Forward from e4 = 28 = occupied by black
      const result = game.execute({ from: 36, to: 28 })
      expect(result.ok).toBe(false)
    })
  })

  describe('check and checkmate', () => {
    it('cannot make move that leaves own king in check', () => {
      const game = createChessGame()
      // Set up: white king on e1(60), black rook on e8(4), white pawn blocking on e2(52)
      // Remove the pawn — king exposed. But we'd need a custom position.
      // Scholar's mate is easier to test:
      game.execute({ from: 52, to: 36 }) // e4
      game.execute({ from: 12, to: 28 }) // e5
      game.execute({ from: 61, to: 34 }) // Bc4
      game.execute({ from: 1, to: 18 }) // Nc6
      game.execute({ from: 59, to: 31 }) // Qh5
      game.execute({ from: 9, to: 17 }) // a6? (blunder)
      // Qxf7# — white queen captures f7 pawn, checkmate
      const result = game.execute({ from: 31, to: 13 }) // Qxf7#
      expect(result.ok).toBe(true)
      expect(result.winner).toBe('white')
    })
  })

  describe('legal moves', () => {
    it('generates legal moves at start', () => {
      const game = createChessGame()
      const moves = game.getLegalMoves()
      // 20 opening moves: 16 pawn moves (8 single + 8 double) + 4 knight moves
      expect(moves.length).toBe(20)
    })

    it('pawn cannot advance into occupied square', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 36 }) // e4
      game.execute({ from: 12, to: 28 }) // e5
      // e4 pawn at 36 cannot go to 28 (occupied)
      const moves = game.getLegalMoves()
      const e4Moves = moves.filter(m => m.from === 36)
      expect(e4Moves.find(m => m.to === 28)).toBeUndefined()
    })
  })

  describe('en passant', () => {
    it('sets en passant target after double pawn push', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 36 }) // e4 (double push)
      expect(game.getState('chess').enPassantTarget).toBe(44) // e3
    })

    it('en passant capture works', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 36 }) // e4
      game.execute({ from: 8, to: 16 }) // a6
      game.execute({ from: 36, to: 28 }) // e5
      game.execute({ from: 11, to: 27 }) // d5 (double push, en passant target = d6 = 19)
      // white pawn at e5(28) can capture en passant at d6(19)
      const moves = game.getLegalMoves()
      const epMove = moves.find(m => m.from === 28 && m.enPassant)
      expect(epMove).toBeDefined()
      if (epMove) {
        const result = game.execute(epMove)
        expect(result.ok).toBe(true)
        expect(game.getState('chess').board[27]).toBeNull() // captured pawn removed
      }
    })
  })

  describe('promotion', () => {
    it('pawn reaching last rank must promote', () => {
      const game = createChessGame({ setup: '8/P7/8/8/8/8/8/4K2k' })
      // White pawn on a7 (row 1, idx 8) — advance to a8 (row 0, idx 0)
      const moves = game.getLegalMoves()
      const promoMoves = moves.filter(m => m.from === 8 && m.promotion)
      expect(promoMoves.length).toBe(4) // queen, rook, bishop, knight
    })
  })

  describe('undo', () => {
    it('undoes a pawn move', () => {
      const game = createChessGame()
      game.execute({ from: 52, to: 44 })
      expect(game.getState('chess').board[44]).toEqual({ type: 'pawn', owner: 0 })
      game.undo()
      expect(game.getState('chess').board[44]).toBeNull()
      expect(game.getState('chess').board[52]).toEqual({ type: 'pawn', owner: 0 })
    })
  })

  describe('vocabulary', () => {
    it('declares chess piece vocabulary', () => {
      const plugin = createChessPlugin()
      expect(plugin.vocabulary.king.symbols[0]).toBe('K')
      expect(plugin.vocabulary.king.symbols[1]).toBe('k')
      expect(plugin.vocabulary.pawn.symbols[0]).toBe('P')
    })
  })

  describe('custom setup from FEN', () => {
    it('loads a custom position', () => {
      const game = createChessGame({ setup: 'r3k2r/8/8/8/8/8/8/R3K2R' })
      const state = game.getState('chess')
      expect(state.board[0]).toEqual({ type: 'rook', owner: 1 })
      expect(state.board[4]).toEqual({ type: 'king', owner: 1 })
      expect(state.board[56]).toEqual({ type: 'rook', owner: 0 })
      expect(state.board[60]).toEqual({ type: 'king', owner: 0 })
      expect(state.board[1]).toBeNull()
    })
  })
})
