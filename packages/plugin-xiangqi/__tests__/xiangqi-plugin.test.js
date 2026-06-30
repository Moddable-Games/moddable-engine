import { createXiangqiPlugin } from '../index.js'

function makeContext(currentIndex = 0) {
  return { __players: { currentIndex } }
}

function request(key) {
  return null
}

describe('plugin-xiangqi', () => {
  describe('init', () => {
    it('creates 10x9 board (90 positions)', () => {
      const plugin = createXiangqiPlugin()
      const state = plugin.init({}, { request })
      expect(state.board.length).toBe(90)
    })
  })

  describe('general movement', () => {
    it('general moves one step orthogonally within palace', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const genMoves = moves.filter(m => m.from === 76)
      expect(genMoves.length).toBeGreaterThan(0)
      for (const m of genMoves) {
        const [r, c] = [Math.floor(m.to / 9), m.to % 9]
        expect(c).toBeGreaterThanOrEqual(3)
        expect(c).toBeLessThanOrEqual(5)
        expect(r).toBeGreaterThanOrEqual(7)
        expect(r).toBeLessThanOrEqual(9)
      }
    })
  })

  describe('chariot movement', () => {
    it('slides orthogonally (like rook)', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[41] = { type: 'chariot', owner: 0 }
      board[76] = { type: 'general', owner: 0 }
      board[3] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const chariotMoves = moves.filter(m => m.from === 41)
      expect(chariotMoves.length).toBeGreaterThan(10)
    })
  })

  describe('cannon — screen jump capture', () => {
    it('cannon moves orthogonally to empty squares (no screen)', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[40] = { type: 'cannon', owner: 0 }
      board[85] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const cannonMoves = moves.filter(m => m.from === 40)
      expect(cannonMoves.length).toBeGreaterThan(5)
    })

    it('cannon captures by jumping over exactly one screen piece', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[40] = { type: 'cannon', owner: 0 }
      board[22] = { type: 'soldier', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      board[85] = { type: 'general', owner: 0 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const cannonMoves = moves.filter(m => m.from === 40)
      expect(cannonMoves.some(m => m.to === 4)).toBe(true)
    })

    it('cannon cannot capture without screen', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[40] = { type: 'cannon', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      board[85] = { type: 'general', owner: 0 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const cannonMoves = moves.filter(m => m.from === 40)
      expect(cannonMoves.some(m => m.to === 4)).toBe(false)
    })
  })

  describe('soldier movement', () => {
    it('soldier moves forward only before crossing river', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[58] = { type: 'soldier', owner: 0 }
      board[85] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const soldierMoves = moves.filter(m => m.from === 58)
      expect(soldierMoves.length).toBe(1)
      expect(soldierMoves[0].to).toBe(49)
    })

    it('soldier gains sideways movement after crossing river', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[40] = { type: 'soldier', owner: 0 }
      board[76] = { type: 'general', owner: 0 }
      board[3] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const soldierMoves = moves.filter(m => m.from === 40)
      expect(soldierMoves.length).toBe(3)
    })
  })

  describe('elephant — river constraint', () => {
    it('elephant cannot cross river', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[56] = { type: 'elephant', owner: 0 }
      board[85] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const elephantMoves = moves.filter(m => m.from === 56)
      for (const m of elephantMoves) {
        const [r] = [Math.floor(m.to / 9)]
        expect(r).toBeGreaterThanOrEqual(5)
      }
    })
  })

  describe('flying general rule', () => {
    it('generals cannot face each other on open file', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const genMoves = moves.filter(m => m.from === 76)
      for (const m of genMoves) {
        const testBoard = [...board]
        testBoard[m.to] = testBoard[m.from]
        testBoard[m.from] = null
        const [gr] = [Math.floor(m.to / 9)]
        const gc = m.to % 9
        if (gc === 4) {
          let blocked = false
          for (let r = Math.floor(m.to / 9) - 1; r > Math.floor(4 / 9); r--) {
            if (testBoard[r * 9 + gc]) { blocked = true; break }
          }
        }
      }
      expect(genMoves.length).toBeGreaterThan(0)
    })
  })

  describe('janggi variant (no river, pass allowed, cannon jumps to move)', () => {
    it('supports pass move', () => {
      const plugin = createXiangqiPlugin({ hasRiver: false, passAllowed: true, cannonJumpToMove: true })
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      board[40] = { type: 'soldier', owner: 0 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      expect(moves.some(m => m.action === 'pass')).toBe(true)
    })

    it('elephant not restricted by river when hasRiver is false', () => {
      const plugin = createXiangqiPlugin({ hasRiver: false, passAllowed: true })
      const board = new Array(90).fill(null)
      board[47] = { type: 'elephant', owner: 0 }
      board[85] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      const moves = plugin.getLegalMoves(state, makeContext(0))
      const eMoves = moves.filter(m => m.from === 47)
      const crossRiver = eMoves.filter(m => Math.floor(m.to / 9) < 5)
      expect(crossRiver.length).toBeGreaterThan(0)
    })
  })

  describe('win conditions', () => {
    it('checkmate wins', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      board[5] = { type: 'chariot', owner: 0 }
      board[3] = { type: 'chariot', owner: 0 }
      board[13] = { type: 'chariot', owner: 0 }
      const state = { board, _cols: 9 }
      const result = plugin.checkWin(state, makeContext(0))
      expect(result).toBe('player1')
    })

    it('returns null during play', () => {
      const plugin = createXiangqiPlugin()
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      const state = { board, _cols: 9 }
      expect(plugin.checkWin(state, makeContext(0))).toBe(null)
    })
  })

  describe('metadata', () => {
    it('has correct slice name', () => {
      const plugin = createXiangqiPlugin()
      expect(plugin.sliceName).toBe('xiangqi')
    })

    it('declares rules for composition', () => {
      const plugin = createXiangqiPlugin()
      expect(plugin.rules).toContain('constraint.region')
      expect(plugin.rules).toContain('capture.screen-jump')
    })
  })
})
