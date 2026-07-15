import { createDraughtsPlugin } from '../index.js'

function makeContext(currentIndex = 0) {
  return { __players: { currentIndex } }
}

function request(key) {
  return null
}

describe('plugin-draughts', () => {
  describe('init', () => {
    it('creates an 8x8 board with 12 pieces per side', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      expect(state.board.length).toBe(64)
      const whites = state.board.filter(p => p && p.owner === 0)
      const blacks = state.board.filter(p => p && p.owner === 1)
      expect(whites.length).toBe(12)
      expect(blacks.length).toBe(12)
    })

    it('places pieces only on dark squares', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      for (let i = 0; i < 64; i++) {
        if (state.board[i] !== null) {
          const row = Math.floor(i / 8)
          const col = i % 8
          expect((row + col) % 2).toBe(1)
        }
      }
    })

    it('initialises with chain inactive', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      expect(state._chainActive).toBe(false)
      expect(state._chainFrom).toBe(null)
    })

    it('supports custom board sizes (10x10 international)', () => {
      const plugin = createDraughtsPlugin({ rows: 10, cols: 10, piecesPerPlayer: 20 })
      const state = plugin.init({}, { request })
      expect(state.board.length).toBe(100)
      const whites = state.board.filter(p => p && p.owner === 0)
      expect(whites.length).toBe(20)
    })
  })

  describe('simple moves', () => {
    it('man moves forward diagonally', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(2)
      expect(moves.some(m => m.to === 35)).toBe(true)
      expect(moves.some(m => m.to === 37)).toBe(true)
    })

    it('man cannot move backward', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[28] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const destinations = moves.map(m => m.to)
      expect(destinations.includes(35)).toBe(false)
      expect(destinations.includes(37)).toBe(false)
    })

    it('king moves in all diagonal directions', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[28] = { type: 'king', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.some(m => m.to === 19)).toBe(true)
      expect(moves.some(m => m.to === 21)).toBe(true)
      expect(moves.some(m => m.to === 35)).toBe(true)
      expect(moves.some(m => m.to === 37)).toBe(true)
    })
  })

  describe('captures', () => {
    it('single capture removes enemy piece', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      board[35] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(1)
      expect(moves[0].from).toBe(44)
      expect(moves[0].to).toBe(26)
      expect(moves[0].captures).toEqual([35])
    })

    it('forced capture — cannot make simple move when capture available', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      board[35] = { type: 'man', owner: 1 }
      board[46] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const simpleMoves = moves.filter(m => !m.captures || m.captures.length === 0)
      expect(simpleMoves.length).toBe(0)
    })

    it('apply capture updates board correctly', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      board[35] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const result = plugin.applyMove({ from: 44, to: 26, captures: [35] }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.board[44]).toBe(null)
      expect(newState.board[35]).toBe(null)
      expect(newState.board[26]).toEqual({ type: 'man', owner: 0 })
    })
  })

  describe('chain capture (multi-hop)', () => {
    it('returns full chain with multiple captures', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      board[35] = { type: 'man', owner: 1 }
      board[19] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(1)
      expect(moves[0].captureCount).toBe(2)
      expect(moves[0].captures).toEqual([35, 19])
      expect(moves[0].to).toBe(12)
    })

    it('applies full chain in one move', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[44] = { type: 'man', owner: 0 }
      board[35] = { type: 'man', owner: 1 }
      board[19] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const move = { from: 44, to: 12, captures: [35, 19] }
      const result = plugin.applyMove(move, state, makeContext(0))
      const newState = result.state || result
      expect(newState.board[44]).toBe(null)
      expect(newState.board[35]).toBe(null)
      expect(newState.board[19]).toBe(null)
      expect(newState.board[12]).toEqual({ type: 'man', owner: 0 })
    })

    it('supports hop-by-hop via continueTurn when chain split across moves', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[51] = { type: 'man', owner: 0 }
      board[44] = { type: 'man', owner: 1 }
      board[28] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const result = plugin.applyMove({ from: 51, to: 37, captures: [44] }, state, makeContext(0))
      expect(result.continueTurn).toBe(true)
      expect(result.state._chainActive).toBe(true)
      expect(result.state._chainFrom).toBe(37)
    })
  })

  describe('promotion', () => {
    it('promotes man to king on reaching back rank (player 0)', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[9] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const result = plugin.applyMove({ from: 9, to: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.board[0]).toEqual({ type: 'king', owner: 0 })
    })

    it('promotes man to king on reaching back rank (player 1)', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[54] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      const result = plugin.applyMove({ from: 54, to: 63 }, state, makeContext(1))
      const newState = result.state || result
      expect(newState.board[63]).toEqual({ type: 'king', owner: 1 })
    })
  })

  describe('win conditions', () => {
    it('wins when opponent has no pieces', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      board[28] = { type: 'king', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      expect(plugin.checkWin(state, makeContext(0))).toBe('player1')
    })

    it('wins when opponent has no legal moves', () => {
      const plugin = createDraughtsPlugin()
      const board = new Array(64).fill(null)
      // Player 1 man on row 0 edge — cannot move forward (would go off board)
      // but forward for player 1 is toward higher rows, so put on last row edge
      // Player 1 man at pos 62 (r=7,c=6). Forward: [+1,-1] and [+1,+1] both out of bounds
      // Actually player 1 forward is [+1,*] which goes beyond row 7
      // So man at row 7 can't move forward at all
      board[62] = { type: 'man', owner: 1 }
      board[53] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
      expect(plugin.checkWin(state, makeContext(0))).toBe('player1')
    })

    it('returns null when game is ongoing', () => {
      const plugin = createDraughtsPlugin()
      const state = plugin.init({}, { request })
      expect(plugin.checkWin(state, makeContext(0))).toBe(null)
    })
  })

  describe('variant configurations', () => {
    describe('international draughts (10x10, flying kings, maximal capture)', () => {
      const intlPlugin = createDraughtsPlugin({
        rows: 10,
        cols: 10,
        piecesPerPlayer: 20,
        flyingKings: true,
        maximalCapture: true,
        captureBackward: true,
      })

      it('initialises 10x10 board with 20 pieces per side', () => {
        const state = intlPlugin.init({}, { request })
        const whites = state.board.filter(p => p && p.owner === 0)
        expect(whites.length).toBe(20)
      })

      it('flying king moves multiple squares', () => {
        const board = new Array(100).fill(null)
        board[55] = { type: 'king', owner: 0 }
        const state = { board, _cols: 10, _chainActive: false, _chainFrom: null }
        const moves = intlPlugin.getLegalMoves(state, makeContext(0))
        expect(moves.some(m => m.to === 22)).toBe(true)
        expect(moves.some(m => m.to === 88)).toBe(true)
      })

      it('maximal capture enforces longest chain', () => {
        const board = new Array(100).fill(null)
        board[77] = { type: 'man', owner: 0 }
        board[66] = { type: 'man', owner: 1 }
        board[44] = { type: 'man', owner: 1 }
        board[64] = { type: 'man', owner: 1 }
        const state = { board, _cols: 10, _chainActive: false, _chainFrom: null }
        const moves = intlPlugin.getLegalMoves(state, makeContext(0))
        if (moves.length > 0) {
          const maxCaptures = Math.max(...moves.map(m => m.captureCount || 0))
          const allMaximal = moves.every(m => (m.captureCount || 0) === maxCaptures)
          expect(allMaximal).toBe(true)
        }
      })
    })

    describe('turkish draughts (orthogonal movement)', () => {
      const turkishPlugin = createDraughtsPlugin({
        directions: 'orthogonal',
        piecesPerPlayer: 16,
        flyingKings: true,
        captureBackward: false,
      })

      it('man moves orthogonally (forward and sideways)', () => {
        const board = new Array(64).fill(null)
        board[28] = { type: 'man', owner: 0 }
        const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
        const moves = turkishPlugin.getLegalMoves(state, makeContext(0))
        expect(moves.some(m => m.to === 20)).toBe(true)
        expect(moves.some(m => m.to === 27)).toBe(true)
        expect(moves.some(m => m.to === 29)).toBe(true)
        expect(moves.some(m => m.to === 36)).toBe(false)
      })

      it('uses all squares (not just diagonal)', () => {
        const state = turkishPlugin.init({}, { request })
        const pieces = state.board.filter(Boolean)
        expect(pieces.length).toBe(32)
      })
    })

    describe('english draughts (no backward capture for men)', () => {
      const englishPlugin = createDraughtsPlugin({
        captureBackward: false,
        forcedCapture: true,
      })

      it('man cannot capture backward', () => {
        const board = new Array(64).fill(null)
        board[28] = { type: 'man', owner: 0 }
        board[37] = { type: 'man', owner: 1 }
        const state = { board, _cols: 8, _chainActive: false, _chainFrom: null }
        const moves = englishPlugin.getLegalMoves(state, makeContext(0))
        const captures = moves.filter(m => m.captures && m.captures.length > 0)
        expect(captures.length).toBe(0)
      })
    })
  })

  describe('metadata', () => {
    it('has correct slice name and piece types', () => {
      const plugin = createDraughtsPlugin()
      expect(plugin.sliceName).toBe('draughts')
      expect(plugin.pieceTypes).toEqual(['man', 'king'])
    })

    it('declares rules for composition', () => {
      const plugin = createDraughtsPlugin()
      expect(plugin.rules).toBeDefined()
      expect(plugin.rules).toContain('forced-capture')
      expect(plugin.rules).toContain('chain-capture')
      expect(plugin.rules).toContain('promotion.rank-reach')
    })
  })
})
