import { createGameFromDefinition } from '../../game/index.js'
import { createGridTopology } from '../../topology-grid/index.js'
import { createGoPlugin } from '../index.js'
import { createThemeResolver } from '../../board-theme/index.js'
import { createPieceResolver } from '../../piece-theme/index.js'
import { createBoardRenderer } from '../../render/index.js'

const goDefinition = {
  topology: { type: 'grid', rows: 9, cols: 9 },
  players: { names: ['black', 'white'], count: 2 },
  plugins: {
    go: { komi: 6.5, scoring: 'territory' },
  },
  render: { alternating: false },
}

const stoneManifest = {
  id: 'glass-stones',
  name: 'Glass Stones',
  pieces: {
    stone: { element: 'circle', attrs: { r: 14 } },
  },
  owners: {
    black: { fill: '#1a1a1a', stroke: '#000' },
    white: { fill: '#fafafa', stroke: '#999' },
  },
  fallback: { element: 'circle', attrs: { r: 8 } },
}

describe('proof: Go full vertical', () => {
  let game, themeResolver, pieceResolver, renderer

  beforeEach(() => {
    themeResolver = createThemeResolver()
    pieceResolver = createPieceResolver(stoneManifest)
    renderer = createBoardRenderer()

    game = createGameFromDefinition(goDefinition, {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { go: (cfg, ctx) => createGoPlugin(cfg, ctx) },
      boardTheme: themeResolver.resolve('wood'),
      pieceResolver,
    })
  })

  describe('game creation from definition', () => {
    it('creates a game with topology', () => {
      expect(game.topology).not.toBeNull()
      expect(game.topology.rows).toBe(9)
      expect(game.topology.cols).toBe(9)
      expect(game.topology.size).toBe(81)
    })

    it('topology has traversal methods bound', () => {
      expect(typeof game.topology.floodFill).toBe('function')
      expect(typeof game.topology.getGroup).toBe('function')
      expect(typeof game.topology.hasPath).toBe('function')
    })

    it('initialises go plugin state', () => {
      const state = game.getState('go')
      expect(state.board.length).toBe(81)
      expect(state.passes).toBe(0)
      expect(state.komi).toBe(6.5)
    })

    it('starts with black as current player', () => {
      expect(game.currentPlayer()).toBe('black')
    })
  })

  describe('gameplay', () => {
    it('places stones and alternates turns', () => {
      game.execute({ coord: 40 })
      expect(game.getState('go').board[40]).toBe('black')
      expect(game.currentPlayer()).toBe('white')

      game.execute({ coord: 41 })
      expect(game.getState('go').board[41]).toBe('white')
      expect(game.currentPlayer()).toBe('black')
    })

    it('captures work with topology traversal', () => {
      // Black stone at center surrounded by white
      // coord 40 = row 4, col 4. Neighbours: 31,49,39,41
      game.execute({ coord: 40 }) // black at 40
      game.execute({ coord: 31 }) // white above
      game.execute({ action: 'pass' }) // black passes
      game.execute({ coord: 49 }) // white below
      game.execute({ action: 'pass' }) // black passes
      game.execute({ coord: 39 }) // white left
      game.execute({ action: 'pass' }) // black passes
      game.execute({ coord: 41 }) // white right — captures black at 40

      expect(game.getState('go').board[40]).toBeNull()
      expect(game.getState('go').captures[1]).toBe(1)
    })

    it('multi-stone capture with topology.getGroup', () => {
      // Build a black group at 40,41 and surround with white
      // 40 neighbours: 31,49,39,41
      // 41 neighbours: 32,50,40,42
      // Group {40,41} liberties: 31,49,39,32,50,42
      game.execute({ coord: 40 }) // black
      game.execute({ coord: 31 }) // white
      game.execute({ coord: 41 }) // black
      game.execute({ coord: 32 }) // white
      game.execute({ action: 'pass' }) // black
      game.execute({ coord: 49 }) // white
      game.execute({ action: 'pass' }) // black
      game.execute({ coord: 50 }) // white
      game.execute({ action: 'pass' }) // black
      game.execute({ coord: 39 }) // white
      game.execute({ action: 'pass' }) // black
      game.execute({ coord: 42 }) // white — captures {40,41}

      expect(game.getState('go').board[40]).toBeNull()
      expect(game.getState('go').board[41]).toBeNull()
      expect(game.getState('go').captures[1]).toBe(2)
    })

    it('two passes end the game', () => {
      game.execute({ action: 'pass' })
      const result = game.execute({ action: 'pass' })
      expect(result.winner).toBe('scoring')
    })

    it('legal moves available at start', () => {
      const moves = game.getLegalMoves()
      expect(moves.length).toBe(82) // 81 cells + pass
    })

    it('ko prevents immediate recapture', () => {
      // Set up a ko situation via the game store
      const board = new Array(81).fill(null)
      // Classic 1-stone ko setup
      board[40] = 'black'
      board[31] = 'white'; board[49] = 'white'; board[39] = 'white'
      // White captures at 41 (right of 40)
      // 40's liberties after white at 41: none → captured, ko at 40
      game.store.set('go', {
        ...game.getState('go'),
        board,
      }, 'go')
      // White's turn - advance
      game.playerSystem.advance(game.store)

      const result = game.execute({ coord: 41 })
      expect(result.ok).toBe(true)
      expect(game.getState('go').ko).toBe(40)

      // Black cannot recapture at 40
      const result2 = game.execute({ coord: 40 })
      expect(result2.ok).toBe(false)
    })
  })

  describe('themed rendering', () => {
    it('produces SVG with board theme applied', () => {
      game.execute({ coord: 40 })
      game.execute({ coord: 41 })

      const layout = game.getLayout()
      const theme = game.boardTheme
      const svg = renderer.render(layout, {
        theme,
        pieces: {
          40: { color: 'black' },
          41: { color: 'white' },
        },
      })

      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
      // Wood theme colours
      expect(svg).toContain('#d4a76a')
      // Pieces present
      expect(svg).toContain('class="pieces"')
    })

    it('piece resolver provides correct render data', () => {
      const blackStone = pieceResolver.resolve('stone', 'black')
      expect(blackStone.element).toBe('circle')
      expect(blackStone.attrs.r).toBe(14)
      expect(blackStone.attrs.fill).toBe('#1a1a1a')

      const whiteStone = pieceResolver.resolve('stone', 'white')
      expect(whiteStone.attrs.fill).toBe('#fafafa')
    })

    it('renders with different themes', () => {
      game.execute({ coord: 0 })

      const layout = game.getLayout()
      const minimalTheme = themeResolver.resolve('minimal')
      const svg = renderer.render(layout, {
        theme: minimalTheme,
        pieces: { 0: { color: 'black' } },
      })

      expect(svg).toContain('#f5f5f5') // minimal uniform colour
    })

    it('layout uses uniform cellType for Go (no alternating)', () => {
      const layout = game.getLayout()
      const cells = layout.getCells()
      expect(cells.every(c => c.cellType === 'uniform')).toBe(true)
    })
  })

  describe('variant configuration', () => {
    it('atari-go variant with custom checkWin', () => {
      const atariGame = createGameFromDefinition(
        { ...goDefinition, plugins: { go: { komi: 0 } } },
        {
          topologies: { grid: (config) => createGridTopology(config) },
          pluginFactories: {
            go: (cfg) => createGoPlugin({
              ...cfg,
              hooks: {
                checkWin: (slice) => {
                  if (slice.captures[0] > 0) return 'black'
                  if (slice.captures[1] > 0) return 'white'
                  return null
                },
              },
            }),
          },
        }
      )

      expect(atariGame.getState('go')).toBeDefined()
      expect(atariGame.currentPlayer()).toBe('black')
    })
  })

  describe('undo through game factory', () => {
    it('undoes placement', () => {
      game.execute({ coord: 40 })
      expect(game.getState('go').board[40]).toBe('black')
      game.undo()
      expect(game.getState('go').board[40]).toBeNull()
    })

    it('undoes capture', () => {
      const board = new Array(81).fill(null)
      board[40] = 'black'
      board[31] = 'white'; board[49] = 'white'; board[39] = 'white'
      game.store.set('go', { ...game.getState('go'), board }, 'go')
      game.playerSystem.advance(game.store)

      game.execute({ coord: 41 })
      expect(game.getState('go').board[40]).toBeNull()
      game.undo()
      expect(game.getState('go').board[40]).toBe('black')
    })
  })
})
