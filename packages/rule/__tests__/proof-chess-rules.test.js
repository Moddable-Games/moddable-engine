import { composeRules } from '../index.js'
import { createDraw50MoveRule } from '../src/rules/draw-50-move.js'
import { createCaptureReplacementRule } from '../src/rules/capture-replacement.js'
import { createEnPassantRule } from '../src/rules/en-passant.js'
import { createAttackDetectionRule } from '../src/rules/attack-detection.js'
import { createCheckRule } from '../src/rules/check.js'
import { createPromotionRule } from '../src/rules/promotion.js'
import { createGridTopology } from '../../topology-grid/index.js'

const STANDARD_PIECES = {
  king:   { type: 'rider', dirs: 'all', maxSteps: 1, royal: true },
  queen:  { type: 'rider', dirs: 'all' },
  rook:   { type: 'rider', dirs: 'orthogonal' },
  bishop: { type: 'rider', dirs: 'diagonal' },
  knight: { type: 'leaper', offsets: 'knight' },
  pawn:   { movement: 'pawn' },
}

function setupBoard(fen, topology) {
  const vocabulary = {
    king: { symbols: { 0: 'K', 1: 'k' } },
    queen: { symbols: { 0: 'Q', 1: 'q' } },
    rook: { symbols: { 0: 'R', 1: 'r' } },
    bishop: { symbols: { 0: 'B', 1: 'b' } },
    knight: { symbols: { 0: 'N', 1: 'n' } },
    pawn: { symbols: { 0: 'P', 1: 'p' } },
  }
  return topology.parsePosition(fen, vocabulary)
}

describe('proof: chess rules compose correctly', () => {
  const topology = createGridTopology({ rows: 8, cols: 8 })

  describe('draw.50-move rule', () => {
    it('increments clock on non-pawn non-capture moves', () => {
      const rule = createDraw50MoveRule()
      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 0 }
      const state = { board, halfmoveClock: 0 }
      const result = rule.hooks.beforeMove({ from: 0, to: 8 }, state)
      expect(result.halfmoveClock).toBe(1)
    })

    it('resets clock on pawn move', () => {
      const rule = createDraw50MoveRule()
      const board = new Array(64).fill(null)
      board[48] = { type: 'pawn', owner: 0 }
      const state = { board, halfmoveClock: 50 }
      const result = rule.hooks.beforeMove({ from: 48, to: 40 }, state)
      expect(result.halfmoveClock).toBe(0)
    })

    it('resets clock on capture', () => {
      const rule = createDraw50MoveRule()
      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 0 }
      board[8] = { type: 'pawn', owner: 1 }
      const state = { board, halfmoveClock: 99 }
      const result = rule.hooks.beforeMove({ from: 0, to: 8, capture: true }, state)
      expect(result.halfmoveClock).toBe(0)
    })

    it('declares draw at threshold', () => {
      const rule = createDraw50MoveRule()
      expect(rule.hooks.checkWin({ halfmoveClock: 100 })).toBe('draw')
      expect(rule.hooks.checkWin({ halfmoveClock: 99 })).toBeNull()
    })
  })

  describe('capture.replacement rule', () => {
    it('moves piece from source to target', () => {
      const rule = createCaptureReplacementRule()
      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 0 }
      const state = { board }
      const result = rule.hooks.applyMove({ from: 0, to: 8 }, state)
      expect(result.board[0]).toBeNull()
      expect(result.board[8]).toEqual({ type: 'rook', owner: 0 })
    })

    it('replaces enemy piece', () => {
      const rule = createCaptureReplacementRule()
      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 0 }
      board[8] = { type: 'pawn', owner: 1 }
      const state = { board }
      const result = rule.hooks.applyMove({ from: 0, to: 8, capture: true }, state)
      expect(result.board[8]).toEqual({ type: 'rook', owner: 0 })
    })

    it('skips castling moves', () => {
      const rule = createCaptureReplacementRule()
      const result = rule.hooks.applyMove({ from: 4, to: 6, castle: true }, { board: [] })
      expect(result).toBeNull()
    })

    it('moves piece without handling promotion (promotion rule does that)', () => {
      const rule = createCaptureReplacementRule()
      const board = new Array(64).fill(null)
      board[8] = { type: 'pawn', owner: 0 }
      const state = { board }
      const result = rule.hooks.applyMove({ from: 8, to: 0, promotion: 'queen' }, state)
      expect(result.board[0]).toEqual({ type: 'pawn', owner: 0 })
      expect(result.board[8]).toBeNull()
    })
  })

  describe('en-passant rule', () => {
    it('sets EP target on double push', () => {
      const rule = createEnPassantRule()
      const board = new Array(64).fill(null)
      board[52] = { type: 'pawn', owner: 0 }
      const state = { board, enPassantTarget: null }
      const ctx = { topology, config: {} }
      const result = rule.hooks.applyMove({ from: 52, to: 36 }, state, ctx)
      expect(result.enPassantTarget).toBe(44)
    })

    it('clears EP target on normal move', () => {
      const rule = createEnPassantRule()
      const board = new Array(64).fill(null)
      board[52] = { type: 'pawn', owner: 0 }
      const state = { board, enPassantTarget: 20 }
      const ctx = { topology, config: {} }
      const result = rule.hooks.applyMove({ from: 52, to: 44 }, state, ctx)
      expect(result.enPassantTarget).toBeNull()
    })

    it('performs EP capture', () => {
      const rule = createEnPassantRule()
      const board = new Array(64).fill(null)
      board[28] = { type: 'pawn', owner: 0 }
      board[27] = { type: 'pawn', owner: 1 }
      const state = { board, enPassantTarget: 19 }
      const ctx = { topology, config: {} }
      const move = { from: 28, to: 19, capture: true, enPassant: true, captured: 27 }
      const result = rule.hooks.applyMove(move, state, ctx)
      expect(result.board[19]).toEqual({ type: 'pawn', owner: 0 })
      expect(result.board[27]).toBeNull()
      expect(result.board[28]).toBeNull()
    })
  })

  describe('attack-detection rule', () => {
    it('detects rook attack along file', () => {
      const rule = createAttackDetectionRule()
      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 1 }
      board[60] = { type: 'king', owner: 0 }
      const ctx = {
        topology,
        playerIndex: 0,
        config: { pieceConfigs: STANDARD_PIECES, advancement: { 0: -1, 1: 1 } },
      }
      expect(rule.provides.isAttacked(8, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(48, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(9, { board }, ctx)).toBe(false)
    })

    it('detects knight attack', () => {
      const rule = createAttackDetectionRule()
      const board = new Array(64).fill(null)
      board[18] = { type: 'knight', owner: 1 }
      const ctx = {
        topology,
        playerIndex: 0,
        config: { pieceConfigs: STANDARD_PIECES, advancement: { 0: -1, 1: 1 } },
      }
      expect(rule.provides.isAttacked(28, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(35, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(19, { board }, ctx)).toBe(false)
    })

    it('detects pawn attack', () => {
      const rule = createAttackDetectionRule()
      const board = new Array(64).fill(null)
      board[27] = { type: 'pawn', owner: 1 }
      const ctx = {
        topology,
        playerIndex: 0,
        config: { pieceConfigs: STANDARD_PIECES, advancement: { 0: -1, 1: 1 } },
      }
      expect(rule.provides.isAttacked(36, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(34, { board }, ctx)).toBe(true)
      expect(rule.provides.isAttacked(35, { board }, ctx)).toBe(false)
    })
  })

  describe('check rule (moveFilter)', () => {
    it('filters out moves that leave king in check', () => {
      const attackRule = createAttackDetectionRule()
      const checkRule = createCheckRule()
      const board = new Array(64).fill(null)
      board[60] = { type: 'king', owner: 0 }
      board[4] = { type: 'rook', owner: 1 }
      board[52] = { type: 'bishop', owner: 0 }

      const state = { board }
      const ctx = {
        topology,
        playerIndex: 0,
        config: { pieceConfigs: STANDARD_PIECES, advancement: { 0: -1, 1: 1 } },
        rules: new Map([['attack-detection', attackRule.provides]]),
      }

      const moves = [
        { from: 52, to: 43 },
        { from: 60, to: 59 },
        { from: 60, to: 61 },
      ]

      const filtered = checkRule.hooks.moveFilter(moves, state, ctx)
      const destinations = filtered.map(m => m.to)
      expect(destinations).not.toContain(43)
      expect(destinations).toContain(59)
      expect(destinations).toContain(61)
    })
  })

  describe('composition: multiple rules together', () => {
    it('composes draw + capture rules into unified hooks', () => {
      const rules = [
        createDraw50MoveRule(),
        createCaptureReplacementRule(),
      ]
      const composed = composeRules(rules)

      const board = new Array(64).fill(null)
      board[0] = { type: 'rook', owner: 0 }
      const state = { board, halfmoveClock: 0 }

      const beforeResult = composed.beforeMove({ from: 0, to: 8 }, state, {})
      const applyResult = composed.applyMove({ from: 0, to: 8 }, beforeResult, {})
      expect(applyResult.board[8]).toEqual({ type: 'rook', owner: 0 })
      expect(applyResult.board[0]).toBeNull()
      expect(applyResult.halfmoveClock).toBe(1)
    })

    it('init merges state from multiple rules', () => {
      const rules = [
        createDraw50MoveRule(),
        createEnPassantRule(),
      ]
      const composed = composeRules(rules)
      const state = composed.init({})
      expect(state.halfmoveClock).toBe(0)
      expect(state.enPassantTarget).toBeNull()
    })
  })
})
