import { createHalmaPlugin } from '../index.js'

function makeContext(currentIndex = 0) {
  return { __players: { currentIndex } }
}

function request(key) {
  return null
}

describe('plugin-halma', () => {
  const smallPlugin = createHalmaPlugin({ rows: 8, cols: 8, piecesPerPlayer: 4, campLock: true })

  describe('init', () => {
    it('creates board of correct size', () => {
      const state = smallPlugin.init({}, { request })
      expect(state.board.length).toBe(64)
    })

    it('places pieces in corner camps', () => {
      const state = smallPlugin.init({}, { request })
      const p0 = state.board.filter(c => c === 0)
      const p1 = state.board.filter(c => c === 1)
      expect(p0.length).toBe(4)
      expect(p1.length).toBe(4)
    })

    it('player 0 starts in bottom-left corner area', () => {
      const state = smallPlugin.init({}, { request })
      const p0Positions = state.board.reduce((acc, val, idx) => val === 0 ? [...acc, idx] : acc, [])
      for (const pos of p0Positions) {
        const row = Math.floor(pos / 8)
        expect(row).toBeGreaterThanOrEqual(6)
      }
    })
  })

  describe('step moves', () => {
    it('generates adjacent moves in all 8 directions', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(8)
      const dests = moves.map(m => m.to).sort((a, b) => a - b)
      expect(dests).toEqual([18, 19, 20, 26, 28, 34, 35, 36])
    })

    it('does not generate moves to occupied squares', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      board[28] = 1
      board[35] = 0
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      const dests = moves.map(m => m.to)
      expect(dests).not.toContain(28)
      expect(dests).not.toContain(35)
    })
  })

  describe('hop chains', () => {
    it('hops over adjacent piece to empty landing', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      board[28] = 1
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      expect(moves.some(m => m.to === 29)).toBe(true)
    })

    it('chains multiple hops', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      board[28] = 1
      board[30] = 1
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      expect(moves.some(m => m.to === 29)).toBe(true)
      expect(moves.some(m => m.to === 31)).toBe(true)
    })

    it('does not hop over empty squares', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      const hopMoves = moves.filter(m => Math.abs(m.to - m.from) > 9)
      expect(hopMoves.length).toBe(0)
    })

    it('can hop over own pieces', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      board[28] = 0
      const state = { board, _cols: 8 }
      const moves = smallPlugin.getLegalMoves(state, makeContext(0))
      const hopsFrom27 = moves.filter(m => m.from === 27)
      expect(hopsFrom27.some(m => m.to === 29)).toBe(true)
    })
  })

  describe('apply move', () => {
    it('moves piece to destination', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      const state = { board, _cols: 8 }
      const result = smallPlugin.applyMove({ from: 27, to: 28 }, state, makeContext(0))
      expect(result.board[27]).toBe(null)
      expect(result.board[28]).toBe(0)
    })

    it('does not capture (no pieces removed)', () => {
      const board = new Array(64).fill(null)
      board[27] = 0
      board[28] = 1
      const state = { board, _cols: 8 }
      const result = smallPlugin.applyMove({ from: 27, to: 29 }, state, makeContext(0))
      expect(result.board[28]).toBe(1)
      expect(result.board[29]).toBe(0)
    })
  })

  describe('win condition', () => {
    it('wins when all pieces occupy opponent camp', () => {
      const plugin = createHalmaPlugin({ rows: 4, cols: 4, piecesPerPlayer: 2, campLock: false })
      const state = plugin.init({}, { request })
      const board = new Array(16).fill(null)
      // Player 0's target is camp[1] (player 1's starting camp)
      // Player 1's camp is top-right area
      // For 4x4 with 2 pieces: camp1 = {0:row0,col3; 1:row0,col2} → indices depend on buildCornerCamp
      // Let's just fill player 0 into camp 1 positions
      const camps = plugin.init({}, { request })
      // Find where camp1 is by looking at initial state
      const camp1Positions = []
      for (let i = 0; i < camps.board.length; i++) {
        if (camps.board[i] === 1) camp1Positions.push(i)
      }
      const testBoard = new Array(16).fill(null)
      for (const pos of camp1Positions) {
        testBoard[pos] = 0
      }
      testBoard[15] = 1
      const testState = { board: testBoard, _cols: 4 }
      expect(plugin.checkWin(testState, makeContext(0))).toBe('player1')
    })

    it('returns null when game is ongoing', () => {
      const state = smallPlugin.init({}, { request })
      expect(smallPlugin.checkWin(state, makeContext(0))).toBe(null)
    })
  })

  describe('metadata', () => {
    it('has correct slice name', () => {
      expect(smallPlugin.sliceName).toBe('halma')
    })

    it('declares rules for composition', () => {
      expect(smallPlugin.rules).toContain('movement.chain-hop')
      expect(smallPlugin.rules).toContain('win.camp-occupation')
    })
  })
})
