import { createCaptureReplacementRule } from '../src/rules/capture-replacement.js'

describe('capture-replacement rule', () => {
  describe('array boards', () => {
    it('moves piece from source to target', () => {
      const rule = createCaptureReplacementRule()
      const state = { board: [null, 'pawn', null, 'enemy', null] }
      const result = rule.hooks.applyMove({ from: 1, to: 3 }, state, {})
      expect(result.board[1]).toBe(null)
      expect(result.board[3]).toBe('pawn')
    })

    it('captures by replacement (target overwritten)', () => {
      const rule = createCaptureReplacementRule()
      const state = { board: ['rook', null, null, 'enemy'] }
      const result = rule.hooks.applyMove({ from: 0, to: 3 }, state, {})
      expect(result.board[0]).toBe(null)
      expect(result.board[3]).toBe('rook')
    })

    it('does not mutate original board', () => {
      const rule = createCaptureReplacementRule()
      const board = ['rook', null, null]
      const state = { board }
      rule.hooks.applyMove({ from: 0, to: 2 }, state, {})
      expect(board[0]).toBe('rook')
      expect(board[2]).toBe(null)
    })
  })

  describe('object boards', () => {
    it('moves piece from source to target', () => {
      const rule = createCaptureReplacementRule()
      const state = { board: { a1: 'rook', b2: null, c3: 'enemy' } }
      const result = rule.hooks.applyMove({ from: 'a1', to: 'c3' }, state, {})
      expect(result.board.a1).toBe(null)
      expect(result.board.c3).toBe('rook')
    })

    it('does not mutate original board', () => {
      const rule = createCaptureReplacementRule()
      const board = { a1: 'knight', d4: null }
      const state = { board }
      rule.hooks.applyMove({ from: 'a1', to: 'd4' }, state, {})
      expect(board.a1).toBe('knight')
    })
  })

  describe('skipFlags', () => {
    it('skips when move has a flagged property (chess castling)', () => {
      const rule = createCaptureReplacementRule({ skipFlags: ['castle', 'enPassant'] })
      const state = { board: ['king', null, null, null, 'rook'] }
      const result = rule.hooks.applyMove({ from: 0, to: 2, castle: true }, state, {})
      expect(result).toBe(null)
    })

    it('skips when move has en passant flag', () => {
      const rule = createCaptureReplacementRule({ skipFlags: ['castle', 'enPassant'] })
      const state = { board: [null, 'pawn', null] }
      const result = rule.hooks.applyMove({ from: 1, to: 2, enPassant: true }, state, {})
      expect(result).toBe(null)
    })

    it('applies normally when no flagged property present', () => {
      const rule = createCaptureReplacementRule({ skipFlags: ['castle'] })
      const state = { board: [null, 'pawn', null] }
      const result = rule.hooks.applyMove({ from: 1, to: 2 }, state, {})
      expect(result.board[1]).toBe(null)
      expect(result.board[2]).toBe('pawn')
    })

    it('works with empty skipFlags (default)', () => {
      const rule = createCaptureReplacementRule()
      const state = { board: ['X', null] }
      const result = rule.hooks.applyMove({ from: 0, to: 1, castle: true }, state, {})
      expect(result.board[0]).toBe(null)
      expect(result.board[1]).toBe('X')
    })
  })

  describe('edge cases', () => {
    it('returns null when no piece at source', () => {
      const rule = createCaptureReplacementRule()
      const state = { board: [null, null, null] }
      const result = rule.hooks.applyMove({ from: 0, to: 1 }, state, {})
      expect(result).toBe(null)
    })
  })

  it('has correct metadata', () => {
    const rule = createCaptureReplacementRule()
    expect(rule.id).toBe('capture.replacement')
    expect(rule.category).toBe('capture')
    expect(rule.requires).toEqual([])
  })
})
