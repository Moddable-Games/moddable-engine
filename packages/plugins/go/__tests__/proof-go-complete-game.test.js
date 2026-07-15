import { createGoPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'

describe('proof: Go complete games', () => {
  function createGoGame(size = 9, variantConfig = {}) {
    return createGameFromDefinition(
      {
        topology: { type: 'grid', rows: size, cols: size },
        players: { names: ['black', 'white'], count: 2 },
        plugins: { go: { komi: 6.5, ...variantConfig } },
        render: { alternating: false },
      },
      {
        topologies: { grid: (config) => createGridTopology(config) },
        pluginFactories: { go: (cfg, ctx) => createGoPlugin(cfg, ctx) },
      }
    )
  }

  describe('standard Go (9x9): plays to scoring via double pass', () => {
    it('plays moves then both pass to end', () => {
      const game = createGoGame(9)

      game.execute({ coord: 40 }) // black center
      game.execute({ coord: 0 })  // white corner
      game.execute({ coord: 41 }) // black
      game.execute({ coord: 1 })  // white
      game.execute({ coord: 50 }) // black
      game.execute({ coord: 9 })  // white

      game.execute({ action: 'pass' })
      const result = game.execute({ action: 'pass' })
      expect(result.winner).toBe('scoring')
    })

    it('capture sequence resolves correctly mid-game', () => {
      const game = createGoGame(5)
      // 5x5 grid. Capture a corner stone.
      // Coord 0 = (0,0). Neighbours: 1 (right), 5 (below).
      game.execute({ coord: 0 })  // black corner
      game.execute({ coord: 1 })  // white right of corner
      game.execute({ coord: 12 }) // black center (filler)
      game.execute({ coord: 5 })  // white below corner — captures black at 0

      expect(game.getState('go').board[0]).toBeNull()
      expect(game.getState('go').captures[1]).toBe(1)

      // Game continues
      game.execute({ coord: 20 }) // black elsewhere
      expect(game.getState('go').board[20]).toBe('black')

      // White still has those stones
      expect(game.getState('go').board[1]).toBe('white')
      expect(game.getState('go').board[5]).toBe('white')
    })
  })

  describe('atari-go variant: first capture wins', () => {
    it('plays to first capture win', () => {
      const game = createGoGame(5, {
        hooks: {
          checkWin: (slice) => {
            if (slice.captures[0] > 0) return 'black'
            if (slice.captures[1] > 0) return 'white'
            return null
          },
        },
      })

      // White surrounds black for capture — white wins
      game.execute({ coord: 12 }) // black center
      game.execute({ coord: 7 })  // white above
      game.execute({ coord: 0 })  // black corner (filler)
      game.execute({ coord: 17 }) // white below
      game.execute({ coord: 1 })  // black (filler)
      game.execute({ coord: 11 }) // white left
      game.execute({ coord: 2 })  // black (filler)
      const result = game.execute({ coord: 13 }) // white captures

      expect(result.winner).toBe('white')
    })
  })

  describe('suicide prevention works in real play', () => {
    it('prevents playing into a surrounded empty point', () => {
      const game = createGoGame(5)
      // Fill all neighbours of corner 0 (which are 1 and 5) with white
      game.execute({ coord: 12 }) // black (filler)
      game.execute({ coord: 1 })  // white
      game.execute({ coord: 13 }) // black (filler)
      game.execute({ coord: 5 })  // white

      // Now black tries to play at 0 — both neighbours are white, no capture possible
      const result = game.execute({ coord: 0 })
      expect(result.ok).toBe(false)
    })
  })
})
