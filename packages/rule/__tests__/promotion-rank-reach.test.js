import { createPromotionRankReachRule } from '../src/rules/promotion-rank-reach.js'

describe('promotion-rank-reach rule', () => {
  describe('array boards', () => {
    it('promotes man to king on reaching rank', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: 0,
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(64).fill(null)
      board[3] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 11, to: 3 }, state, ctx)
      expect(result.board[3]).toEqual({ type: 'king', owner: 0 })
    })

    it('does not promote non-eligible piece types', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: 0,
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(64).fill(null)
      board[3] = { type: 'king', owner: 0 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 11, to: 3 }, state, ctx)
      expect(result).toBe(null)
    })

    it('does not promote when not on promotion rank', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: 0,
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(64).fill(null)
      board[28] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 37, to: 28 }, state, ctx)
      expect(result).toBe(null)
    })
  })

  describe('per-player promotion ranks', () => {
    it('player 0 promotes on rank 0, player 1 on rank 7', () => {
      const rule = createPromotionRankReachRule({
        perPlayer: { 0: 0, 1: 7 },
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(64).fill(null)
      board[60] = { type: 'man', owner: 1 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 1, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 51, to: 60 }, state, ctx)
      expect(result.board[60]).toEqual({ type: 'king', owner: 1 })
    })
  })

  describe('string-based pieces', () => {
    it('replaces string piece with promoted type', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: 0,
        promotedType: 'queen',
        eligibleTypes: ['pawn'],
      })
      const board = new Array(64).fill(null)
      board[2] = 'pawn'
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 10, to: 2 }, state, ctx)
      expect(result.board[2]).toBe('queen')
    })
  })

  describe('function-based rank detection', () => {
    it('supports predicate function for rank', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: (pos) => pos < 4,
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(32).fill(null)
      board[2] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0 }
      const result = rule.hooks.afterMove({ from: 6, to: 2 }, state, ctx)
      expect(result.board[2]).toEqual({ type: 'king', owner: 0 })
    })
  })

  describe('does not mutate original', () => {
    it('returns new board reference', () => {
      const rule = createPromotionRankReachRule({
        promotionRank: 0,
        promotedType: 'king',
        eligibleTypes: ['man'],
      })
      const board = new Array(64).fill(null)
      board[3] = { type: 'man', owner: 0 }
      const state = { board, _cols: 8 }
      const ctx = { playerIndex: 0, topology: { cols: 8 } }
      const result = rule.hooks.afterMove({ from: 11, to: 3 }, state, ctx)
      expect(result.board).not.toBe(board)
      expect(board[3]).toEqual({ type: 'man', owner: 0 })
    })
  })

  it('has correct metadata', () => {
    const rule = createPromotionRankReachRule({})
    expect(rule.id).toBe('promotion.rank-reach')
    expect(rule.category).toBe('effect')
  })
})
