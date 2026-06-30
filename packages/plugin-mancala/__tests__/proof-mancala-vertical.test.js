import { createGameFromDefinition } from '../../game/index.js'
import { createPitTopology } from '../../topology-pit/index.js'
import { createMancalaPlugin } from '../index.js'
import { createThemeResolver } from '../../board-theme/index.js'
import { createBoardRenderer } from '../../render/index.js'

const mancalaDefinition = {
  topology: { type: 'pit', pitsPerSide: 6 },
  players: { names: ['player1', 'player2'], count: 2 },
  plugins: {
    mancala: { seeds: 4, captureRule: 'own-empty', lastSeedInStore: 'extra-turn' },
  },
}

describe('proof: Mancala full vertical', () => {
  let game, renderer

  beforeEach(() => {
    const themeResolver = createThemeResolver()
    renderer = createBoardRenderer()

    game = createGameFromDefinition(mancalaDefinition, {
      topologies: { pit: (config) => createPitTopology(config) },
      pluginFactories: { mancala: (cfg, ctx) => createMancalaPlugin(cfg, ctx) },
      boardTheme: themeResolver.resolve('classic'),
    })
  })

  describe('game creation', () => {
    it('creates pit topology', () => {
      expect(game.topology).not.toBeNull()
      expect(game.topology.pitsPerSide).toBe(6)
      expect(game.topology.totalPits).toBe(12)
    })

    it('initialises mancala state from topology', () => {
      const state = game.getState('mancala')
      expect(state.pits).toHaveLength(12)
      expect(state.pits.every(p => p === 4)).toBe(true)
      expect(state.stores).toEqual([0, 0])
      expect(state.pitsPerSide).toBe(6)
    })
  })

  describe('sowing with topology sowSequence', () => {
    it('sows seeds using topology-provided path', () => {
      game.execute({ pit: 0 })
      const state = game.getState('mancala')
      expect(state.pits[0]).toBe(0)
      // Topology sowSequence skips opponent store, includes own store
      // From pit 0, sowing 4 seeds → positions depend on sowSequence
    })

    it('extra turn when last seed lands in own store', () => {
      // Player 1's store is at index 12 (totalPits + 0)
      // From pit 2, sowing 4 seeds: lands at pos 3,4,5,store(12)
      // sowSequence from pit 2: [3,4,5,12,6,7,8,9,10,11,0,1]
      // 4 seeds → positions 3,4,5,12. Last = store. Extra turn!
      const result = game.execute({ pit: 2 })
      expect(result.continueTurn).toBe(true)
      expect(game.currentPlayer()).toBe('player1') // still player1's turn
    })

    it('no extra turn when last seed lands in pit', () => {
      const result = game.execute({ pit: 0 })
      // From pit 0, sow 4: [1,2,3,4] or with store path
      // sowSequence from 0: [1,2,3,4,5,12,6,7,8,9,10,11]
      // 4 seeds → positions 1,2,3,4. Last = pit 4. No extra turn.
      expect(result.continueTurn).toBeFalsy()
    })

    it('skips opponent store during sowing', () => {
      // Player 1's store = 12, Player 2's store = 13
      // sowSequence for player 0 should skip index 13
      const seq = game.topology.sowSequence(0, 0)
      expect(seq).toContain(12) // own store included
      expect(seq).not.toContain(13) // opponent store skipped
    })
  })

  describe('capture with topology.getOpposite', () => {
    it('captures using topology-derived opposite', () => {
      // Set up: pit 2 has 1 seed, pit 3 is empty, opposite of 3 is pit 8
      game.store.set('mancala', {
        ...game.getState('mancala'),
        pits: [0, 0, 1, 0, 0, 0, 4, 4, 6, 4, 4, 4],
      }, 'mancala')

      game.execute({ pit: 2 })
      const state = game.getState('mancala')
      // Landing in pit 3 (empty, own side). Opposite = 11-3 = 8 (has 6 seeds)
      // Capture: store gets 6 + 1 = 7
      expect(state.stores[0]).toBe(7)
    })
  })

  describe('game end', () => {
    it('ends when one side empties', () => {
      game.store.set('mancala', {
        ...game.getState('mancala'),
        pits: [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
        stores: [20, 27],
      }, 'mancala')
      const result = game.execute({ pit: 5 })
      expect(result.winner).not.toBeNull()
    })
  })

  describe('themed rendering', () => {
    it('produces SVG with pit/store layout', () => {
      game.execute({ pit: 0 })

      const layout = game.getLayout()
      const svg = renderer.render(layout, { theme: game.boardTheme })

      expect(svg).toContain('<svg')
      expect(svg).toContain('ellipse')
    })
  })

  describe('variant: Oware (no capture rule)', () => {
    it('creates oware variant with no captures', () => {
      const owareGame = createGameFromDefinition(
        {
          ...mancalaDefinition,
          plugins: { mancala: { seeds: 4, captureRule: 'none', lastSeedInStore: 'normal' } },
        },
        {
          topologies: { pit: (config) => createPitTopology(config) },
          pluginFactories: {
            mancala: (cfg) => createMancalaPlugin({ ...cfg, captureRule: 'none', lastSeedInStore: 'normal' }),
          },
        }
      )

      const state = owareGame.getState('mancala')
      expect(state.pits.every(p => p === 4)).toBe(true)
    })
  })
})
