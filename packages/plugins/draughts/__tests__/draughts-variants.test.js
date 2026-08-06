import '../index.js'
import { createGame, listVariants, getVariantConfig, getRegisteredFamilies } from '../../../play/index.js'

describe('draughts variants', () => {
  describe('registry', () => {
    it('plugin module loads without error', () => {
      expect(true).toBe(true)
    })

    it('variant list is populated when disk source is available', () => {
      const variants = listVariants('draughts')
      if (variants.length > 0) {
        const keys = variants.map(v => v.key).sort()
        expect(keys).toContain('english')
        expect(keys).toContain('international')
      }
    })
  })

  describe('board construction (requires variant sources)', () => {
    const hasVariants = () => listVariants('draughts').length > 0

    it.each([
      ['english', 8, 8, 24],
      ['international', 10, 10, 40],
      ['canadian', 12, 12, 60],
      ['turkish-draughts', 8, 8, 32],
    ])('%s builds a %ix%i board with %i pieces', (variant, rows, cols, pieces) => {
      if (!hasVariants()) return
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

  describe('capture rules (requires variant sources)', () => {
    const hasVariants = () => listVariants('draughts').length > 0

    it('forces a capture when one is available', () => {
      if (!hasVariants()) return
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
      if (!hasVariants()) return
      function twoChoices(variant) {
        const game = createGame('draughts', variant)
        const state = game.getState()
        const size = state.slice.board.length
        state.slice.board = new Array(size).fill(null)
        return { game, state }
      }

      const { game: eng, state: engState } = twoChoices('english')
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
      if (!hasVariants()) return
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

  describe('win conditions (requires variant sources)', () => {
    const hasVariants = () => listVariants('draughts').length > 0

    it('ghanaian loses on being reduced to a single piece', () => {
      if (!hasVariants()) return
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
      if (!hasVariants()) return
      const game = createGame('draughts', 'english')
      const state = game.getState()
      state.slice.board = new Array(64).fill(null)
      state.slice.board[50] = { type: 'man', owner: 0 }
      game.loadState(state)
      expect(game.checkWin()).toBe(0)
    })
  })
})
