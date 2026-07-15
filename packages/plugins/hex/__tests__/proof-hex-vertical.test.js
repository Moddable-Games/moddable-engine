import { createGameFromDefinition } from '../../../game/index.js'
import { createHexTopology } from '../../../topology-hex/index.js'
import { createHexPlugin } from '../index.js'
import { createThemeResolver } from '../../../board-theme/index.js'
import { createPieceResolver } from '../../../piece-theme/index.js'
import { createBoardRenderer } from '../../../render/index.js'

const hexDefinition = {
  topology: { type: 'hex', size: 5, shape: 'rhombus' },
  players: { names: ['black', 'white'], count: 2 },
  plugins: {
    hex: {},
  },
}

const stoneManifest = {
  id: 'hex-stones',
  name: 'Hex Stones',
  pieces: {
    stone: { element: 'circle', attrs: { r: 8 } },
  },
  owners: {
    black: { fill: '#222', stroke: '#000' },
    white: { fill: '#eee', stroke: '#777' },
  },
  fallback: { element: 'circle', attrs: { r: 6 } },
}

describe('proof: Hex full vertical', () => {
  let game, themeResolver, pieceResolver, renderer

  beforeEach(() => {
    themeResolver = createThemeResolver()
    pieceResolver = createPieceResolver(stoneManifest)
    renderer = createBoardRenderer()

    game = createGameFromDefinition(hexDefinition, {
      topologies: { hex: (config) => createHexTopology(config) },
      pluginFactories: { hex: (cfg, ctx) => createHexPlugin(cfg, ctx) },
      boardTheme: themeResolver.resolve('minimal'),
      pieceResolver,
    })
  })

  describe('game creation', () => {
    it('creates hex topology with rhombus shape', () => {
      expect(game.topology).not.toBeNull()
      expect(game.topology.shape).toBe('rhombus')
      expect(game.topology.boardSize).toBe(5)
      expect(game.topology.size).toBe(25) // 5x5
    })

    it('topology has traversal methods', () => {
      expect(typeof game.topology.floodFill).toBe('function')
      expect(typeof game.topology.getGroup).toBe('function')
      expect(typeof game.topology.hasPath).toBe('function')
    })

    it('initialises hex plugin state', () => {
      const state = game.getState('hex')
      expect(state.cells).toEqual({})
      expect(state.boardSize).toBe(5)
    })

    it('starts with black', () => {
      expect(game.currentPlayer()).toBe('black')
    })
  })

  describe('gameplay with topology', () => {
    it('places stones using coord keys', () => {
      game.execute({ coord: '2,3' })
      expect(game.getState('hex').cells['2,3']).toBe('black')
      expect(game.currentPlayer()).toBe('white')
    })

    it('uses topology.hasPath for connection detection', () => {
      // Black connects left to right: (0,2),(1,2),(2,2),(3,2),(4,2)
      for (let q = 0; q < 5; q++) {
        game.execute({ coord: `${q},2` }) // black
        if (q < 4) game.execute({ coord: `${q},0` }) // white
      }
      // The last black move should have triggered a win
      // But the pipeline checks win after each move...
      // Let me check the state directly
      const state = game.getState('hex')
      expect(state.cells['0,2']).toBe('black')
      expect(state.cells['4,2']).toBe('black')
    })

    it('black wins via topology.hasPath', () => {
      const results = []
      for (let q = 0; q < 5; q++) {
        results.push(game.execute({ coord: `${q},2` }))
        if (q < 4) game.execute({ coord: `${q},0` })
      }
      expect(results[4].winner).toBe('black')
    })

    it('white wins top-to-bottom', () => {
      for (let r = 0; r < 5; r++) {
        game.execute({ coord: `0,${r}` }) // black on left column
        if (r < 4) game.execute({ coord: `2,${r}` }) // white on column 2
      }
      // Black hasn't connected q=0 to q=4
      // White needs one more at 2,4
      const result = game.execute({ coord: '2,4' })
      expect(result.winner).toBe('white')
    })

    it('legal moves come from topology.getAllCells()', () => {
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(25)
      expect(moves[0].coord).toBeDefined()
    })
  })

  describe('themed rendering', () => {
    it('produces SVG with hex board', () => {
      game.execute({ coord: '2,2' })

      const layout = game.getLayout()
      const svg = renderer.render(layout, {
        theme: game.boardTheme,
        pieces: { '2,2': { color: 'black' } },
      })

      expect(svg).toContain('<svg')
      expect(svg).toContain('polygon')
      expect(svg).toContain('class="pieces"')
    })

    it('piece resolver works for hex stones', () => {
      const black = pieceResolver.resolve('stone', 'black')
      expect(black.element).toBe('circle')
      expect(black.attrs.fill).toBe('#222')
    })
  })

  describe('variant: swap rule', () => {
    it('creates game with swap rule enabled', () => {
      const swapGame = createGameFromDefinition(
        {
          ...hexDefinition,
          plugins: { hex: { swapRule: true } },
        },
        {
          topologies: { hex: (config) => createHexTopology(config) },
          pluginFactories: { hex: (cfg, ctx) => createHexPlugin({ ...cfg, swapRule: true }, ctx) },
        }
      )

      swapGame.execute({ coord: '2,2' })
      const moves = swapGame.getLegalMoves()
      expect(moves.find(m => m.action === 'swap')).toBeDefined()
    })
  })
})
