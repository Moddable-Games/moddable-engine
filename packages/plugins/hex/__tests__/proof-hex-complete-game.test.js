import { createHexPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createHexTopology } from '../../../topology-hex/index.js'

describe('proof: Hex complete games', () => {
  function createHexGame(size = 5, variantConfig = {}) {
    return createGameFromDefinition(
      {
        topology: { type: 'hex', size, shape: 'rhombus' },
        players: { names: ['black', 'white'], count: 2 },
        plugins: { hex: variantConfig },
      },
      {
        topologies: { hex: (config) => createHexTopology(config) },
        pluginFactories: { hex: (cfg, ctx) => createHexPlugin({ ...cfg, ...variantConfig }, ctx) },
      }
    )
  }

  describe('standard Hex (5x5): black wins left-to-right', () => {
    it('straight line connection', () => {
      const game = createHexGame(5)
      const results = []
      for (let q = 0; q < 5; q++) {
        results.push(game.execute({ coord: `${q},2` })) // black row 2
        if (q < 4) game.execute({ coord: `${q},0` }) // white row 0 (filler)
      }
      expect(results[4].winner).toBe('black')
    })

    it('diagonal path connection', () => {
      const game = createHexGame(5)
      // Path: (0,4),(1,3),(2,2),(3,1),(4,0) — uses hex diagonals
      const path = [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]
      const results = []
      for (let i = 0; i < path.length; i++) {
        const [q, r] = path[i]
        results.push(game.execute({ coord: `${q},${r}` })) // black
        if (i < path.length - 1) game.execute({ coord: `${i},0` }) // white filler at top row (avoid collision)
      }
      expect(results[4].winner).toBe('black')
    })
  })

  describe('standard Hex (5x5): white wins top-to-bottom', () => {
    it('white connects r=0 to r=4', () => {
      const game = createHexGame(5)
      for (let r = 0; r < 5; r++) {
        game.execute({ coord: `0,${r}` }) // black left column
        if (r < 4) game.execute({ coord: `2,${r}` }) // white column 2
      }
      const result = game.execute({ coord: '2,4' }) // white completes
      expect(result.winner).toBe('white')
    })
  })

  describe('swap rule variant', () => {
    it('swap reverses first move ownership and game continues', () => {
      const game = createHexGame(5, { swapRule: true })

      game.execute({ coord: '2,2' }) // black plays center
      expect(game.getState('hex').cells['2,2']).toBe('black')

      game.execute({ action: 'swap' }) // white swaps
      expect(game.getState('hex').cells['2,2']).toBe('white')
      expect(game.currentPlayer()).toBe('black')

      // Game continues normally after swap
      game.execute({ coord: '0,0' }) // black
      expect(game.getState('hex').cells['0,0']).toBe('black')
    })

    it('swap only available on second move', () => {
      const game = createHexGame(5, { swapRule: true })
      game.execute({ coord: '2,2' }) // black
      game.execute({ coord: '3,3' }) // white plays normally instead of swapping

      // Black's turn — swap no longer available
      const moves = game.getLegalMoves()
      expect(moves.find(m => m.action === 'swap')).toBeUndefined()
    })
  })

  describe('no draws possible', () => {
    it('filling the board must produce a winner (Hex theorem)', () => {
      const game = createHexGame(3) // 3x3 for tractability
      const allCells = game.topology.getAllCells()
      let winner = null

      for (const cell of allCells) {
        if (winner) break
        if (game.getState('hex').cells[cell] !== undefined) continue
        const result = game.execute({ coord: cell })
        if (result.winner) winner = result.winner
      }

      expect(winner).not.toBeNull()
    })
  })
})
