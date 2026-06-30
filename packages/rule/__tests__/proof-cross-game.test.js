import { composeRules } from '../src/compose.js'
import { createCaptureReplacementRule } from '../src/rules/capture-replacement.js'
import { createTurnContinuationRule } from '../src/rules/turn-continuation.js'
import { createRepetitionRule } from '../src/rules/repetition.js'

describe('cross-game rule sharing — proof', () => {
  describe('capture.replacement shared between chess and draughts', () => {
    it('chess: moves piece, skips on castle flag', () => {
      const rule = createCaptureReplacementRule({ skipFlags: ['castle', 'enPassant'] })
      const board = [null, null, null, null, 'K', null, null, 'R']
      const state = { board }

      const normal = rule.hooks.applyMove({ from: 4, to: 3 }, state, {})
      expect(normal.board[3]).toBe('K')
      expect(normal.board[4]).toBe(null)

      const castleMove = rule.hooks.applyMove({ from: 4, to: 6, castle: true }, state, {})
      expect(castleMove).toBe(null)
    })

    it('draughts: same rule captures by replacement (no skip flags)', () => {
      const rule = createCaptureReplacementRule()
      const board = { a1: 'W', b2: 'B', c3: null }
      const state = { board }

      const result = rule.hooks.applyMove({ from: 'a1', to: 'c3' }, state, {})
      expect(result.board.a1).toBe(null)
      expect(result.board.c3).toBe('W')
      expect(result.board.b2).toBe('B')
    })

    it('composed: works alongside other rules', () => {
      const capture = createCaptureReplacementRule({ skipFlags: ['castle'] })
      const winRule = {
        id: 'win.no-pieces',
        requires: [],
        hooks: {
          checkWin(state) {
            const pieces = state.board.filter(Boolean)
            return pieces.length <= 1 ? 'winner' : null
          },
        },
      }

      const composed = composeRules([capture, winRule])
      const state = { board: ['W', 'B', null, 'B'] }
      const after = composed.applyMove({ from: 0, to: 2 }, state, {})
      expect(after.board).toEqual([null, 'B', 'W', 'B'])
      expect(composed.checkWin(after, {})).toBe(null)
    })
  })

  describe('turn.continuation shared between mancala, backgammon, morris', () => {
    it('mancala pattern: predicate checks landed-in-store', () => {
      const rule = createTurnContinuationRule({
        mode: 'predicate',
        predicate: (move, state) => state.landedInStore,
      })
      expect(rule.hooks.continueTurn({}, { landedInStore: true }, {})).toBe(true)
      expect(rule.hooks.continueTurn({}, { landedInStore: false }, {})).toBe(false)
    })

    it('backgammon pattern: remaining moves array', () => {
      const rule = createTurnContinuationRule({
        mode: 'remaining',
        field: 'movesRemaining',
      })
      expect(rule.hooks.continueTurn({}, { movesRemaining: [3, 5] }, {})).toBe(true)
      expect(rule.hooks.continueTurn({}, { movesRemaining: [] }, {})).toBe(false)
    })

    it('morris pattern: awaiting sub-action flag', () => {
      const rule = createTurnContinuationRule({
        mode: 'state-flag',
        field: 'awaitingRemoval',
      })
      expect(rule.hooks.continueTurn({}, { awaitingRemoval: true }, {})).toBe(true)
      expect(rule.hooks.continueTurn({}, { awaitingRemoval: false }, {})).toBe(false)
    })

    it('composed: multiple continuation rules (OR strategy)', () => {
      const remaining = createTurnContinuationRule({
        mode: 'remaining',
        field: 'movesRemaining',
      })
      const subAction = createTurnContinuationRule({
        mode: 'state-flag',
        field: 'awaitingRemoval',
      })
      // Give second rule a different id to avoid registry collision
      subAction.id = 'turn.continuation.sub'

      const composed = composeRules([remaining, subAction])
      expect(composed.continueTurn({}, { movesRemaining: [1], awaitingRemoval: false }, {})).toBe(true)
      expect(composed.continueTurn({}, { movesRemaining: [], awaitingRemoval: true }, {})).toBe(true)
      expect(composed.continueTurn({}, { movesRemaining: [], awaitingRemoval: false }, {})).toBe(false)
    })
  })

  describe('repetition shared between go and chess', () => {
    it('go ko: tracks last board hash', () => {
      const rule = createRepetitionRule({ mode: 'ko', stateKey: 'board' })
      const init = rule.hooks.init({})
      expect(init._repetitionLastHash).toBe(null)

      const state = { board: ['black', null, null], _repetitionLastHash: null }
      const after = rule.hooks.afterMove({ coord: 0 }, state, {})
      expect(after._repetitionLastHash).toBeDefined()
    })

    it('go superko: accumulates history', () => {
      const rule = createRepetitionRule({ mode: 'superko', stateKey: 'board' })
      const init = rule.hooks.init({})
      expect(init._repetitionHistory).toEqual([])

      let state = { board: ['black', null], _repetitionHistory: [] }
      const after1 = rule.hooks.afterMove({}, state, {})
      state = { board: [null, 'white'], _repetitionHistory: after1._repetitionHistory }
      const after2 = rule.hooks.afterMove({}, state, {})
      expect(after2._repetitionHistory.length).toBe(2)
    })

    it('chess threefold: counts positions and declares draw', () => {
      const rule = createRepetitionRule({ mode: 'count', threshold: 3, stateKey: 'board' })
      const board = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
      let state = { board, _repetitionCounts: {} }

      // Simulate three identical positions
      for (let i = 0; i < 3; i++) {
        const frag = rule.hooks.afterMove({}, state, {})
        state = { ...state, ...frag }
      }

      expect(rule.hooks.checkWin(state, {})).toBe('draw')
    })

    it('chess: no draw below threshold', () => {
      const rule = createRepetitionRule({ mode: 'count', threshold: 3, stateKey: 'board' })
      const board = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
      let state = { board, _repetitionCounts: {} }

      for (let i = 0; i < 2; i++) {
        const frag = rule.hooks.afterMove({}, state, {})
        state = { ...state, ...frag }
      }

      expect(rule.hooks.checkWin(state, {})).toBe(null)
    })

    it('composed: repetition + win rule (FIRST non-null)', () => {
      const rep = createRepetitionRule({ mode: 'count', threshold: 3, stateKey: 'board' })
      const checkmate = {
        id: 'checkmate',
        requires: [],
        hooks: { checkWin: (state) => state.checkmated ? 'player1' : null },
      }

      const composed = composeRules([checkmate, rep])
      expect(composed.checkWin({ checkmated: true, _repetitionCounts: {} }, {})).toBe('player1')
      expect(composed.checkWin({ checkmated: false, _repetitionCounts: { 'abc': 3 } }, {})).toBe('draw')
      expect(composed.checkWin({ checkmated: false, _repetitionCounts: { 'abc': 1 } }, {})).toBe(null)
    })
  })
})
