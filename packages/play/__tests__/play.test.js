import { createGameForFamily, getFamilies, hasFamily, getPlugin } from '../src/play.js'

describe('play — universal game factory', () => {
  describe('registry', () => {
    it('lists all 13 families', () => {
      const families = getFamilies()
      expect(families.length).toBe(13)
      expect(families).toContain('chess')
      expect(families).toContain('go')
      expect(families).toContain('mancala')
      expect(families).toContain('big2')
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

    it('go: variant option selects 9x9', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(82)
    })

    it('mancala: creates Kalah with 6 moves', () => {
      const game = createGameForFamily('mancala')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(6)
    })

    it('morris: creates nine mens with 24 placement moves', () => {
      const game = createGameForFamily('morris')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(24)
    })

    it('backgammon: first move is roll', () => {
      const game = createGameForFamily('backgammon')
      const moves = game.getLegalMoves()
      expect(moves[0].action).toBe('roll')
    })

    it('draughts: generates 7 opening moves', () => {
      const game = createGameForFamily('draughts')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(7)
    })

    it('reversi: 4 opening placements', () => {
      const game = createGameForFamily('reversi')
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(4)
    })

    it('halma: generates moves for corner pieces', () => {
      const game = createGameForFamily('halma')
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })

    it('hex: generates placement moves', () => {
      const game = createGameForFamily('hex')
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
    })

    it('race: first move is roll', () => {
      const game = createGameForFamily('race')
      const moves = game.getLegalMoves()
      expect(moves[0].action).toBe('roll')
    })

    it('big2: deals 13 cards to each of 4 players', () => {
      const game = createGameForFamily('big2')
      const state = game.getState()
      expect(state.slice.hands.length).toBe(4)
      expect(state.slice.hands[0].length).toBe(13)
    })

    it('shogi: instantiates (empty board, setup from plugin)', () => {
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
      const game = createGameForFamily('reversi')
      const state = game.getState()
      expect(state.family).toBe('reversi')
      expect(state.currentPlayer).toBe('black')
      expect(state.slice).toBeDefined()
      expect(state.slice.board).toBeDefined()
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

    it('loadState restores game state', () => {
      const game = createGameForFamily('mancala')
      const moves = game.getLegalMoves()
      game.applyMove(moves[0])
      const saved = game.getState()

      const game2 = createGameForFamily('mancala')
      game2.loadState(saved)
      const restored = game2.getState()
      expect(restored.slice).toEqual(saved.slice)
    })

    it('raw exposes underlying game object', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
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
          players: '2',
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

    it('accepts a pre-produced definition', () => {
      const game = createGameForFamily('reversi', {
        definition: {
          topology: { type: 'grid', rows: 6, cols: 6 },
          players: { names: ['black', 'white'], count: 2 },
          plugins: { reversi: {} },
        },
      })
      expect(game).toBeDefined()
      expect(game.topology).toBeDefined()
    })
  })

  describe('full game simulation', () => {
    it('mancala: plays to completion', () => {
      const game = createGameForFamily('mancala')
      let moveCount = 0
      while (moveCount < 200) {
        const moves = game.getLegalMoves()
        if (moves.length === 0) break
        game.applyMove(moves[0])
        moveCount++
      }
      expect(moveCount).toBeGreaterThan(5)
      const state = game.getState()
      const side1 = state.slice.pits.slice(0, 6).reduce((a, b) => a + b, 0)
      const side2 = state.slice.pits.slice(6).reduce((a, b) => a + b, 0)
      expect(side1 === 0 || side2 === 0).toBe(true)
    })
  })
})
