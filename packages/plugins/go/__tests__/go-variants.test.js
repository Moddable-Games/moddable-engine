import '../../../play/test-helpers/setup-rules-reader.js'
import '../index.js'
import { createGame, listVariants, getVariantConfig } from '../../../play/index.js'

function place(game, coord) {
  return game.applyMove({ coord })
}

function playSequence(game, coords) {
  for (const coord of coords) {
    const result = place(game, coord)
    if (!result || !result.ok) return false
  }
  return true
}

describe('go variants', () => {
  describe('registry', () => {
    it('registers the go hub variants', () => {
      const keys = listVariants('go').map(v => v.key).sort()
      expect(keys).toEqual([
        '13x13', '9x9', 'capture-go', 'gomoku', 'ninuki-renju',
        'one-colour', 'renju', 'standard', 'stoical', 'toroidal-go',
      ])
    })

    it('9x9 inherits standard go rules (board size proves extends)', () => {
      const game = createGame('go', '9x9')
      const state = game.getState().slice
      expect(state.board.length).toBe(81)
      expect(game.getLegalMoves().length).toBeGreaterThan(0)
    })
  })

  describe('board sizes', () => {
    it.each([
      ['standard', 361],
      ['13x13', 169],
      ['9x9', 81],
      ['capture-go', 81],
      ['gomoku', 225],
      ['toroidal-go', 121],
    ])('%s builds a board of %i points', (variant, cells) => {
      const game = createGame('go', variant)
      expect(game.getState().slice.board.length).toBe(cells)
    })
  })

  describe('capture go', () => {
    it('removes passing from the legal move list', () => {
      const game = createGame('go', 'capture-go')
      expect(game.getLegalMoves().some(m => m.action === 'pass')).toBe(false)
    })

    it('wins immediately on the first capture', () => {
      const game = createGame('go', 'capture-go')
      // white stone at 10 surrounded by black on all four sides
      expect(playSequence(game, [1, 10, 9, 40, 11, 41])).toBe(true)
      const result = place(game, 19)
      expect(result.ok).toBe(true)
      expect(game.checkWin()).toBe(0)
    })

    it('is still running before any capture', () => {
      const game = createGame('go', 'capture-go')
      playSequence(game, [1, 10, 9])
      expect(game.checkWin()).toBeNull()
    })
  })

  describe('gomoku', () => {
    it('never captures, even when a stone is fully surrounded', () => {
      const game = createGame('go', 'gomoku')
      // white at 16 ringed by black; in go this is a capture, in gomoku it is not
      expect(playSequence(game, [1, 16, 15, 100, 17, 101, 31, 102])).toBe(true)
      expect(place(game, 3).ok).toBe(true)
      const state = game.getState().slice
      expect(state.board[16]).toBe('white')
      expect(state.captures[0]).toBe(0)
    })

    it('wins on five in an unbroken row', () => {
      const game = createGame('go', 'gomoku')
      // black builds a row along row 0, white answers on row 5
      const black = [0, 1, 2, 3, 4]
      const white = [75, 76, 77, 78]
      for (let i = 0; i < black.length; i++) {
        expect(place(game, black[i]).ok).toBe(true)
        if (i < white.length) expect(place(game, white[i]).ok).toBe(true)
      }
      expect(game.checkWin()).toBe(0)
    })

    it('does not award the win on four in a row', () => {
      const game = createGame('go', 'gomoku')
      const black = [0, 1, 2, 3]
      const white = [75, 76, 77]
      for (let i = 0; i < black.length; i++) {
        place(game, black[i])
        if (i < white.length) place(game, white[i])
      }
      expect(game.checkWin()).toBeNull()
    })

    it('treats an overline of six as no win under standard rules', () => {
      const game = createGame('go', 'gomoku')
      // black occupies six in a row; the run is longer than five so it does not count
      const black = [0, 1, 2, 3, 4, 5]
      const white = [75, 76, 77, 78, 79]
      for (let i = 0; i < black.length; i++) {
        place(game, black[i])
        if (i < white.length) place(game, white[i])
      }
      expect(game.checkWin()).toBeNull()
    })
  })

  describe('ninuki-renju', () => {
    it('captures a pair of stones flanked on both ends', () => {
      const game = createGame('go', 'ninuki-renju')
      const state = game.getState()
      // row 0: black at 0, white at 1, white at 2, black at 3
      // placing at 0 flanks the pair at 1,2 (already black at 3)
      state.slice.board[3] = 'black'
      state.slice.board[1] = 'white'
      state.slice.board[2] = 'white'
      game.loadState(state)

      place(game, 0)
      const after = game.getState().slice
      expect(after.board[1]).toBeNull()
      expect(after.board[2]).toBeNull()
      expect(after.captures[0]).toBe(2)
    })

    it('wins on ten captured stones', () => {
      const game = createGame('go', 'ninuki-renju')
      const state = game.getState()
      state.slice.captures = { 0: 8, 1: 0 }
      // set up one more pair capture for black
      state.slice.board[3] = 'black'
      state.slice.board[1] = 'white'
      state.slice.board[2] = 'white'
      game.loadState(state)

      place(game, 0)
      expect(game.checkWin()).toBe(0)
    })
  })

  describe('stoical go', () => {
    it('bars capturing moves on the turn after being captured', () => {
      const game = createGame('go', 'stoical')
      const state = game.getState()
      // hand-build a position where white has just captured a black stone
      // and black has a capture available in reply
      state.slice.lastCaptureBy = 1
      state.slice.board[20] = 'white'
      state.slice.board[0] = 'white'
      state.slice.board[1] = 'black'
      state.slice.board[19] = 'black'
      game.loadState(state)

      const moves = game.getLegalMoves()
      expect(moves.every(m => !m.wouldCapture)).toBe(true)
      expect(moves.some(m => m.action === 'pass')).toBe(true)
    })

    it('allows capturing moves when the opponent did not just capture', () => {
      const game = createGame('go', 'stoical')
      const state = game.getState()
      state.slice.lastCaptureBy = null
      state.slice.board[0] = 'white'
      state.slice.board[1] = 'black'
      game.loadState(state)
      const moves = game.getLegalMoves()
      expect(moves.some(m => m.wouldCapture)).toBe(true)
    })
  })

  describe('standard go', () => {
    it('annotates moves that would capture', () => {
      const game = createGame('go', '9x9')
      const state = game.getState()
      state.slice.board[0] = 'white'
      state.slice.board[1] = 'black'
      game.loadState(state)
      const capturing = game.getLegalMoves().find(m => m.coord === 9)
      expect(capturing.wouldCapture).toBe(true)
      expect(capturing.captures).toEqual([0])
    })

    it('enters the scoring phase after two passes', () => {
      const game = createGame('go', '9x9')
      game.applyMove({ action: 'pass' })
      game.applyMove({ action: 'pass' })
      expect(game.checkWin()).toBe('scoring')
    })
  })
})
