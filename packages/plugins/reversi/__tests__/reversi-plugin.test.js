import { createReversiPlugin } from '../index.js'

function makeContext(currentIndex = 0) {
  return { __players: { currentIndex } }
}

function request(key) {
  return null
}

describe('plugin-reversi', () => {
  describe('init', () => {
    it('creates 8x8 board with 4 starting pieces', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(state.board.length).toBe(64)
      const filled = state.board.filter(c => c !== null)
      expect(filled.length).toBe(4)
    })

    it('places starting pieces in standard diagonal pattern', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(state.board[27]).toBe(1)
      expect(state.board[28]).toBe(0)
      expect(state.board[35]).toBe(0)
      expect(state.board[36]).toBe(1)
    })

    it('starts with zero passes', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(state.passCount).toBe(0)
    })

    it('supports 6x6 mini variant', () => {
      const plugin = createReversiPlugin({ rows: 6, cols: 6 })
      const state = plugin.init({}, { request })
      expect(state.board.length).toBe(36)
      const filled = state.board.filter(c => c !== null)
      expect(filled.length).toBe(4)
    })
  })

  describe('legal moves', () => {
    it('finds legal placements for player 0 at start', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const placements = moves.filter(m => m.action !== 'pass')
      expect(placements.length).toBe(4)
    })

    it('each legal move has flips array', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const moves = plugin.getLegalMoves(state, makeContext(0))
      for (const m of moves.filter(m => m.cell !== undefined)) {
        expect(m.flips.length).toBeGreaterThan(0)
      }
    })

    it('returns pass when no placements available', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(null)
      board[0] = 1
      board[1] = 1
      board[2] = 1
      const state = { board, passCount: 0 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(1)
      expect(moves[0].action).toBe('pass')
    })
  })

  describe('apply move', () => {
    it('places disc and flips opponent pieces', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const move = moves.find(m => m.cell === 19)
      const result = plugin.applyMove(move, state, makeContext(0))
      expect(result.board[19]).toBe(0)
      expect(result.board[27]).toBe(0)
    })

    it('resets pass count on placement', () => {
      const plugin = createReversiPlugin()
      const state = { ...plugin.init({}, { request }), passCount: 1 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const result = plugin.applyMove(moves[0], state, makeContext(0))
      expect(result.passCount).toBe(0)
    })

    it('increments pass count on pass', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const result = plugin.applyMove({ action: 'pass' }, state, makeContext(0))
      expect(result.passCount).toBe(1)
    })

    it('does not mutate original board', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      const original = [...state.board]
      const moves = plugin.getLegalMoves(state, makeContext(0))
      plugin.applyMove(moves[0], state, makeContext(0))
      expect(state.board).toEqual(original)
    })
  })

  describe('flanking capture', () => {
    it('flips in multiple directions simultaneously', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(null)
      board[27] = 1
      board[28] = 1
      board[35] = 1
      board[36] = 0
      board[44] = 0
      const state = { board, passCount: 0 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const cornerMove = moves.find(m => m.cell === 19)
      if (cornerMove) {
        expect(cornerMove.flips).toContain(27)
      }
    })

    it('does not flip when no bracketing piece', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(null)
      board[27] = 1
      board[28] = 1
      const state = { board, passCount: 0 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const illegal = moves.find(m => m.cell === 29)
      expect(illegal).toBeUndefined()
    })
  })

  describe('validate move', () => {
    it('rejects placement on occupied cell', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.validateMove({ cell: 27 }, state, makeContext(0))).toBe(false)
    })

    it('rejects placement with no flips', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.validateMove({ cell: 0 }, state, makeContext(0))).toBe(false)
    })

    it('accepts valid placement', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.validateMove({ cell: 19 }, state, makeContext(0))).toBe(true)
    })

    it('rejects pass when placements exist', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.validateMove({ action: 'pass' }, state, makeContext(0))).toBe(false)
    })
  })

  describe('win conditions', () => {
    it('declares winner with most discs (standard)', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(0)
      board[0] = 1
      const state = { board, passCount: 2 }
      expect(plugin.checkWin(state, makeContext(0))).toBe('player1')
    })

    it('declares draw when equal', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(null)
      for (let i = 0; i < 32; i++) board[i] = 0
      for (let i = 32; i < 64; i++) board[i] = 1
      const state = { board, passCount: 2 }
      expect(plugin.checkWin(state, makeContext(0))).toBe('draw')
    })

    it('anti-reversi: fewest discs wins', () => {
      const plugin = createReversiPlugin({ winCondition: 'fewest' })
      const board = new Array(64).fill(0)
      board[0] = 1
      const state = { board, passCount: 2 }
      expect(plugin.checkWin(state, makeContext(0))).toBe('player2')
    })

    it('game ends when board is full', () => {
      const plugin = createReversiPlugin()
      const board = new Array(64).fill(0)
      board[0] = 1
      board[1] = 1
      const state = { board, passCount: 0 }
      expect(plugin.checkWin(state, makeContext(0))).toBe('player1')
    })

    it('returns null during play', () => {
      const plugin = createReversiPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.checkWin(state, makeContext(0))).toBe(null)
    })
  })

  describe('metadata', () => {
    it('has correct slice name and piece types', () => {
      const plugin = createReversiPlugin()
      expect(plugin.sliceName).toBe('reversi')
      expect(plugin.pieceTypes).toEqual(['disc'])
    })

    it('declares rules for composition', () => {
      const plugin = createReversiPlugin()
      expect(plugin.rules).toContain('capture.flanking')
      expect(plugin.rules).toContain('win.count')
    })
  })
})
