import { createMancalaPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createPitTopology } from '../../../topologies/pit/index.js'

describe('proof: Mancala complete games', () => {
  function createMancalaGame(variantConfig = {}) {
    return createGameFromDefinition(
      {
        topology: { type: 'pit', pitsPerSide: 6 },
        players: { names: ['south', 'north'], count: 2 },
        plugins: { mancala: { seeds: 4, ...variantConfig } },
      },
      {
        topologies: { pit: (config) => createPitTopology(config) },
        pluginFactories: { mancala: (cfg, ctx) => createMancalaPlugin(cfg, ctx) },
      }
    )
  }

  describe('standard Kalah: plays to completion', () => {
    it('game terminates when one side empties', () => {
      const game = createMancalaGame()
      let winner = null
      let moves = 0

      while (!winner && moves < 200) {
        const legal = game.getLegalMoves()
        if (legal.length === 0) break
        const result = game.execute(legal[0])
        if (result.winner) winner = result.winner
        moves++
      }

      expect(winner).not.toBeNull()
      expect(['south', 'north', 'player1', 'player2', 'draw']).toContain(winner)
    })

    it('extra turn chains: player moves again after landing in store', () => {
      const game = createMancalaGame()
      // Pit 2 sows into store (4 seeds from pit 2 → 3,4,5,store)
      const result = game.execute({ pit: 2 })
      expect(result.continueTurn).toBe(true)
      expect(game.currentPlayer()).toBe('south')

      // Still south's turn — can make another move
      const legal = game.getLegalMoves()
      expect(legal.length).toBeGreaterThan(0)
      expect(legal[0].pit).toBeDefined()
    })

    it('capture mechanics in real play', () => {
      const game = createMancalaGame()
      // Set up: pit 0 has 1 seed. If sown, lands in pit 1 (empty). Opposite of 1 is 10.
      game.store.set('mancala', {
        ...game.getState('mancala'),
        pits: [1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4],
        stores: [0, 0],
      }, 'mancala')

      game.execute({ pit: 0 })
      const state = game.getState('mancala')
      // Landing in empty pit 1 (own side), opposite pit 10 has 6 seeds
      expect(state.stores[0]).toBe(7) // captured 6 + 1 landing
      expect(state.pits[10]).toBe(0)
    })
  })

  describe('Oware variant: no capture, no extra turn', () => {
    it('plays without captures', () => {
      const game = createMancalaGame({
        captureRule: 'none',
        lastSeedInStore: 'normal',
      })

      // Play pit 2 — in standard game this would give extra turn, but not in this variant
      const result = game.execute({ pit: 2 })
      expect(result.continueTurn).toBeFalsy()

      // No captures happen even when landing in empty own pit
      game.store.set('mancala', {
        ...game.getState('mancala'),
        pits: [1, 0, 0, 0, 4, 4, 4, 4, 4, 4, 6, 4],
        stores: [0, 0],
      }, 'mancala')
      game.execute({ pit: 0 })
      expect(game.getState('mancala').stores[0]).toBe(0)
    })
  })
})
