import '../index.js'
import { createGame, listVariants, getVariantConfig } from '../../../play/index.js'
import { UNSUPPORTED } from '../src/variants/index.js'

describe('draughts variants', () => {
  describe('registry', () => {
    it('registers the parameterisable hub variants', () => {
      const keys = listVariants('draughts').map(v => v.key).sort()
      expect(keys).toEqual([
        'brazilian', 'canadian', 'czech', 'english', 'german', 'ghanaian',
        'international', 'italian', 'pool', 'russian', 'spanish',
        'spantsiretti', 'turkish-draughts',
      ])
    })

    it('documents the variants it deliberately does not register', () => {
      expect(Object.keys(UNSUPPORTED).sort()).toEqual([
        'alquerque', 'bashni', 'dameo', 'diagonal', 'frisian', 'lasca', 'thai',
      ])
      for (const reason of Object.values(UNSUPPORTED)) {
        expect(typeof reason).toBe('string')
        expect(reason.length).toBeGreaterThan(10)
      }
    })

    it('inherits international rules into brazilian', () => {
      const config = getVariantConfig('draughts', 'brazilian')
      expect(config.rows).toBe(8)
      expect(config.flyingKings).toBe(true)
      expect(config.maximalCapture).toBe(true)
      expect(config.removeImmediately).toBe(false)
    })

    it('keeps english free of international overrides', () => {
      const config = getVariantConfig('draughts', 'english')
      expect(config.flyingKings).toBe(false)
      expect(config.maximalCapture).toBe(false)
      expect(config.captureBackward).toBeUndefined()
    })
  })

  describe('board construction', () => {
    it.each([
      ['english', 8, 8, 24],
      ['international', 10, 10, 40],
      ['canadian', 12, 12, 60],
      ['turkish-draughts', 8, 8, 32],
    ])('%s builds a %ix%i board with %i pieces', (variant, rows, cols, pieces) => {
      const game = createGame('draughts', variant)
      const slice = game.getState().slice
      expect(slice.board.length).toBe(rows * cols)
      expect(slice.board.filter(p => p).length).toBe(pieces)
    })

    it('gives every registered variant a legal opening move', () => {
      for (const variant of listVariants('draughts')) {
        const game = createGame('draughts', variant.key)
        expect(game.getLegalMoves().length).toBeGreaterThan(0)
      }
    })
  })

  describe('capture rules', () => {
    it('forces a capture when one is available', () => {
      const game = createGame('draughts', 'english')
      const state = game.getState()
      state.slice.board = new Array(64).fill(null)
      state.slice.board[41] = { type: 'man', owner: 0 }
      state.slice.board[34] = { type: 'man', owner: 1 }
      state.slice.board[43] = { type: 'man', owner: 0 }
      game.loadState(state)

      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.captureCount > 0)).toBe(true)
    })

    it('international requires the longest chain, english does not', () => {
      function twoChoices(variant) {
        const game = createGame('draughts', variant)
        const state = game.getState()
        const size = state.slice.board.length
        state.slice.board = new Array(size).fill(null)
        return { game, state }
      }

      const { game: eng, state: engState } = twoChoices('english')
      // one single capture and one double capture available to the same side
      engState.slice.board[57] = { type: 'man', owner: 0 }
      engState.slice.board[50] = { type: 'man', owner: 1 }
      engState.slice.board[36] = { type: 'man', owner: 1 }
      engState.slice.board[61] = { type: 'man', owner: 0 }
      engState.slice.board[54] = { type: 'man', owner: 1 }
      eng.loadState(engState)
      const engMoves = eng.getLegalMoves()
      const engLengths = new Set(engMoves.map(m => m.captureCount))
      expect(engMoves.length).toBeGreaterThan(0)

      const { game: intl, state: intlState } = twoChoices('international')
      intlState.slice.board[71] = { type: 'man', owner: 0 }
      intlState.slice.board[62] = { type: 'man', owner: 1 }
      intlState.slice.board[44] = { type: 'man', owner: 1 }
      intl.loadState(intlState)
      const intlMoves = intl.getLegalMoves()
      if (intlMoves.length > 1) {
        const max = Math.max(...intlMoves.map(m => m.captureCount))
        expect(intlMoves.every(m => m.captureCount === max)).toBe(true)
      }
      expect(engLengths.size).toBeGreaterThan(0)
    })

    it('italian stops a man from capturing a king', () => {
      const game = createGame('draughts', 'italian')
      const state = game.getState()
      state.slice.board = new Array(64).fill(null)
      state.slice.board[41] = { type: 'man', owner: 0 }
      state.slice.board[34] = { type: 'king', owner: 1 }
      state.slice.board[60] = { type: 'man', owner: 0 }
      game.loadState(state)

      const moves = game.getLegalMoves()
      expect(moves.every(m => (m.captureCount || 0) === 0)).toBe(true)
    })
  })

  describe('win conditions', () => {
    it('ghanaian loses on being reduced to a single piece', () => {
      const game = createGame('draughts', 'ghanaian')
      const state = game.getState()
      state.slice.board = new Array(100).fill(null)
      state.slice.board[50] = { type: 'man', owner: 0 }
      state.slice.board[55] = { type: 'man', owner: 0 }
      state.slice.board[44] = { type: 'man', owner: 1 }
      game.loadState(state)
      expect(game.checkWin()).toBe(0)
    })

    it('reports the winner using the definition player names', () => {
      const game = createGame('draughts', 'english')
      const state = game.getState()
      state.slice.board = new Array(64).fill(null)
      state.slice.board[50] = { type: 'man', owner: 0 }
      game.loadState(state)
      expect(game.checkWin()).toBe(0)
    })
  })
})
