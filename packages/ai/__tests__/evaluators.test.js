import { chessEvaluate, reversiEvaluate, draughtsEvaluate, mancalaEvaluate, goEvaluate, halmaEvaluate, raceEvaluate, shogiEvaluate, xiangqiEvaluate, EVALUATORS } from '../src/evaluators.js'

describe('AI — evaluators', () => {
  describe('chess', () => {
    it('returns positive for material advantage', () => {
      const board = new Array(64).fill(null)
      board[0] = { type: 'king', owner: 0 }
      board[63] = { type: 'king', owner: 1 }
      board[10] = { type: 'queen', owner: 0 }
      const state = { board }
      expect(chessEvaluate(state, 0)).toBeGreaterThan(0)
      expect(chessEvaluate(state, 1)).toBeLessThan(0)
    })

    it('returns zero for equal material', () => {
      const board = new Array(64).fill(null)
      board[0] = { type: 'king', owner: 0 }
      board[63] = { type: 'king', owner: 1 }
      const state = { board }
      const score = chessEvaluate(state, 0)
      expect(Math.abs(score)).toBeLessThan(0.05)
    })

    it('uses positional bonuses on 8x8 boards', () => {
      const board = new Array(64).fill(null)
      board[27] = { type: 'knight', owner: 0 }
      board[0] = { type: 'knight', owner: 1 }
      const state = { board }
      expect(chessEvaluate(state, 0)).toBeGreaterThan(0)
    })
  })

  describe('reversi', () => {
    it('values corners highly', () => {
      const board = new Array(64).fill(null)
      board[0] = 0
      board[32] = 1
      const state = { board }
      expect(reversiEvaluate(state, 0)).toBeGreaterThan(reversiEvaluate(state, 1))
    })

    it('penalises X-squares (adjacent to corners)', () => {
      const board = new Array(64).fill(null)
      board[9] = 0
      board[32] = 1
      const state = { board }
      expect(reversiEvaluate(state, 0)).toBeLessThan(0)
    })
  })

  describe('draughts', () => {
    it('values kings higher than men', () => {
      const board = new Array(64).fill(null)
      board[0] = { type: 'king', owner: 0 }
      board[63] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8 }
      expect(draughtsEvaluate(state, 0)).toBeGreaterThan(0)
    })

    it('values advancement', () => {
      const board = new Array(64).fill(null)
      board[4] = { type: 'man', owner: 0 }
      const state1 = { board: [...board], _cols: 8 }
      const board2 = new Array(64).fill(null)
      board2[60] = { type: 'man', owner: 0 }
      const state2 = { board: board2, _cols: 8 }
      expect(draughtsEvaluate(state1, 0)).toBeGreaterThan(draughtsEvaluate(state2, 0))
    })
  })

  describe('mancala', () => {
    it('values store advantage', () => {
      const state = { stores: [10, 5], pits: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], pitsPerSide: 6 }
      expect(mancalaEvaluate(state, 0)).toBeGreaterThan(0)
      expect(mancalaEvaluate(state, 1)).toBeLessThan(0)
    })
  })

  describe('go', () => {
    it('values stone and capture advantage', () => {
      const board = new Array(81).fill(null)
      board[0] = 'black'
      board[1] = 'black'
      board[2] = 'white'
      const state = { board, captures: { 0: 3, 1: 0 } }
      expect(goEvaluate(state, 0)).toBeGreaterThan(0)
    })
  })

  describe('halma', () => {
    it('rewards pieces closer to target camp', () => {
      const board = new Array(64).fill(null)
      board[1] = 0
      const state1 = { board: [...board], _cols: 8 }
      board[1] = null
      board[62] = 0
      const state2 = { board, _cols: 8 }
      expect(halmaEvaluate(state1, 0)).toBeGreaterThan(halmaEvaluate(state2, 0))
    })
  })

  describe('race', () => {
    it('values advanced and finished pieces', () => {
      const state1 = { pieces: [[{ state: 'active', position: 10 }], [{ state: 'home', position: -1 }]] }
      const state2 = { pieces: [[{ state: 'home', position: -1 }], [{ state: 'active', position: 10 }]] }
      expect(raceEvaluate(state1, 0)).toBeGreaterThan(0)
      expect(raceEvaluate(state2, 0)).toBeLessThan(0)
    })
  })

  describe('shogi', () => {
    it('values material including hand pieces', () => {
      const board = new Array(25).fill(null)
      board[12] = { type: 'king', owner: 0 }
      board[0] = { type: 'king', owner: 1 }
      const state = { board, hands: [['gold', 'silver'], []] }
      expect(shogiEvaluate(state, 0)).toBeGreaterThan(0)
    })
  })

  describe('xiangqi', () => {
    it('values material advantage', () => {
      const board = new Array(90).fill(null)
      board[76] = { type: 'general', owner: 0 }
      board[4] = { type: 'general', owner: 1 }
      board[40] = { type: 'chariot', owner: 0 }
      const state = { board }
      expect(xiangqiEvaluate(state, 0)).toBeGreaterThan(0)
    })
  })

  describe('EVALUATORS registry', () => {
    it('maps game families to evaluate functions', () => {
      expect(Object.keys(EVALUATORS)).toEqual(
        expect.arrayContaining(['chess', 'reversi', 'draughts', 'mancala', 'go', 'halma', 'race', 'shogi', 'xiangqi'])
      )
    })

    it('all evaluators return numbers', () => {
      for (const [name, fn] of Object.entries(EVALUATORS)) {
        const dummyState = { board: new Array(64).fill(null), stores: [0, 0], pits: new Array(12).fill(4), pitsPerSide: 6, pieces: [[{ state: 'home', position: -1 }], [{ state: 'home', position: -1 }]], hands: [[], []], _cols: 8 }
        const result = fn(dummyState, 0)
        expect(typeof result).toBe('number')
      }
    })
  })
})
