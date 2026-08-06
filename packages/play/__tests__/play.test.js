import { createGameForFamily, getFamilies, hasFamily, getPlugin } from '../src/play.js'

describe('play — universal game factory', () => {
  describe('registry', () => {
    it('lists all 5 families', () => {
      const families = getFamilies()
      expect(families.length).toBe(5)
      expect(families).toContain('chess')
      expect(families).toContain('go')
      expect(families).toContain('draughts')
      expect(families).toContain('shogi')
      expect(families).toContain('xiangqi')
    })

    it('hasFamily returns true for registered families', () => {
      expect(hasFamily('chess')).toBe(true)
      expect(hasFamily('unknown')).toBe(false)
    })

    it('getPlugin returns factory for known family', () => {
      const entry = getPlugin('chess')
      expect(entry).not.toBeNull()
      expect(typeof entry.factory).toBe('function')
    })

    it('getPlugin returns null for unknown family', () => {
      expect(getPlugin('boggle')).toBeNull()
    })
  })

  describe('createGameForFamily — default definitions', () => {
    it('throws for unknown family', () => {
      expect(() => createGameForFamily('boggle')).toThrow(/Unknown game family/)
    })

    it('chess: creates game with 20 opening moves', () => {
      const game = createGameForFamily('chess')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(20)
      expect(game.currentPlayer()).toBe('white')
    })

    it('go: creates 19x19 game by default', () => {
      const game = createGameForFamily('go')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(362)
    })

    it('draughts: generates 7 opening moves', () => {
      const game = createGameForFamily('draughts')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(7)
    })

    it('shogi: instantiates with topology', () => {
      const game = createGameForFamily('shogi')
      expect(game).toBeDefined()
      expect(game.topology).toBeDefined()
    })

    it('xiangqi: instantiates with 10x9 board', () => {
      const game = createGameForFamily('xiangqi')
      expect(game).toBeDefined()
      expect(game.topology).toBeDefined()
    })
  })

  describe('uniform interface', () => {
    it('applyMove advances the game', () => {
      const game = createGameForFamily('chess')
      expect(game.currentPlayer()).toBe('white')
      const moves = game.getLegalMoves()
      game.applyMove(moves[0])
      expect(game.currentPlayer()).toBe('black')
    })

    it('getState returns family, currentPlayer, and slice', () => {
      const game = createGameForFamily('chess')
      const state = game.getState()
      expect(state.family).toBe('chess')
      expect(state.currentPlayer).toBe('white')
      expect(state.slice).toBeDefined()
    })

    it('checkWin returns null at start', () => {
      const game = createGameForFamily('chess')
      expect(game.checkWin()).toBeNull()
    })

    it('undo reverses a move', () => {
      const game = createGameForFamily('chess')
      const moves = game.getLegalMoves()
      game.applyMove(moves[0])
      expect(game.currentPlayer()).toBe('black')
      game.undo()
      expect(game.currentPlayer()).toBe('white')
    })

    it('raw exposes underlying game object', () => {
      const game = createGameForFamily('go')
      expect(game.raw).toBeDefined()
      expect(game.raw.topology).toBeDefined()
      expect(game.raw.store).toBeDefined()
    })
  })

  describe('custom definition', () => {
    it('accepts a frontmatter-style definition', () => {
      const game = createGameForFamily('go', {
        definition: {
          title: 'Custom Go',
          slug: 'custom',
          parent: 'go',
          engine: {
            topology: { type: 'grid', rows: 5, cols: 5 },
            players: ['black', 'white'],
            plugins: { go: { size: 25 } },
          },
        },
      })
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(26)
    })
  })
})
