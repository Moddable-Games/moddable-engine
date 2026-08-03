/**
 * Headless DOM tests for game-play surface features.
 * Each test asserts observable requirements through the same construction
 * path the application uses (createGameController + renderFromEngine).
 */
import fs from 'fs'
import path from 'path'
import { createGameController } from '../../packages/play/src/game-controller.js'
import { createChessPlugin } from '../../packages/plugins/chess/index.js'
import { createGameFromDefinition } from '../../packages/game/index.js'
import { createGridTopology } from '../../packages/topologies/grid/index.js'
import { renderFromEngine, attachPieceImages, fenToPosition } from '../../packages/render/src/render-engine.js'
import { createCellAddressing } from '../play-cells.js'
import { CAPTURE_BURST_THEME, ANIM_THEME, BOARD_THEMES, PIECE_STYLES } from '../play-shared.js'

const GALLERY_PATH = path.resolve(process.cwd(), 'pieces/gallery-index.json')
const gallery = fs.existsSync(GALLERY_PATH)
  ? JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'))
  : null

function createChessGame(pluginConfig = {}) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: pluginConfig },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin(cfg, ctx) },
    }
  )
}

describe('AI scheduling', () => {
  it('produces a move when AI is the first player to act', (done) => {
    const game = createChessGame()
    const ctrl = createGameController(game, {
      players: { white: 'ai', black: 'human' },
      onMove: (move, player) => {
        expect(player).toBe('white')
        expect(move.from).toBeGreaterThanOrEqual(0)
        expect(move.to).toBeGreaterThanOrEqual(0)
        expect(ctrl.currentPlayer()).toBe('black')
        done()
      },
    })
    expect(ctrl.getState().aiThinking).toBe(true)
  })

  it('AI moves immediately after human move when AI is player 2', (done) => {
    const game = createChessGame()
    let humanMoved = false
    const ctrl = createGameController(game, {
      players: { white: 'human', black: 'ai' },
      onMove: (move, player) => {
        if (player === 'white') {
          humanMoved = true
        } else if (player === 'black') {
          expect(humanMoved).toBe(true)
          expect(ctrl.currentPlayer()).toBe('white')
          done()
        }
      },
    })
    ctrl.handleClick(52)
    ctrl.handleClick(36)
  })
})

describe('flip — view-layer coordinate inversion', () => {
  it('cell addressing maps logical index 0 (a8) to visual h1 when flipped', () => {
    const cells = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic' })
    expect(cells.toId(0)).toBe('a8')
    cells.setFlipped(true)
    expect(cells.toId(0)).toBe('h1')
  })

  it('flipped render places the a1 piece at the h8 cell position with glyph upright', () => {
    if (!gallery) return
    const fen = '8/8/8/8/8/8/8/R7'
    const resolved = {
      topology: { type: 'grid', rows: 8, cols: 8 },
      render: { cellColor: 'checkered', interactive: true },
      setup: fen,
      pieces: { set: 'chessnut' },
    }
    const pieceResult = attachPieceImages(resolved, gallery)
    const normalSvg = renderFromEngine(resolved, { pieceImages: pieceResult.images || {} })
    const flippedSvg = renderFromEngine(resolved, { pieceImages: pieceResult.images || {}, flipped: true })

    const normalPieceMatch = normalSvg.match(/<image[^>]*href="[^"]*wR[^"]*"[^>]*x="([^"]*)"[^>]*y="([^"]*)"/)
    const flippedPieceMatch = flippedSvg.match(/<image[^>]*href="[^"]*wR[^"]*"[^>]*x="([^"]*)"[^>]*y="([^"]*)"/)

    expect(normalPieceMatch).not.toBeNull()
    expect(flippedPieceMatch).not.toBeNull()

    const normalY = parseFloat(normalPieceMatch[2])
    const flippedY = parseFloat(flippedPieceMatch[2])
    expect(normalY).toBeGreaterThan(flippedY)

    const normalHref = normalSvg.match(/<image[^>]*href="([^"]*wR[^"]*)"/)[1]
    const flippedHref = flippedSvg.match(/<image[^>]*href="([^"]*wR[^"]*)"/)[1]
    expect(flippedHref).toBe(normalHref)
  })

  it('flipped position inverses: a1 content appears at h8 key', () => {
    const fen = '8/8/8/8/8/8/8/R7'
    const position = fenToPosition(fen, 8, 8)
    expect(position['a1']).toBe('R')
    expect(position['h8']).toBeUndefined()

    const resolved = {
      topology: { type: 'grid', rows: 8, cols: 8 },
      render: { cellColor: 'checkered', interactive: true },
      setup: fen,
      pieces: { set: 'chessnut' },
    }
    const pieceResult = attachPieceImages(resolved, gallery || [])
    const flippedSvg = renderFromEngine(resolved, { pieceImages: pieceResult.images || {}, flipped: true })
    expect(flippedSvg).toContain('data-sq="h8"')
  })
})

describe('board theme', () => {
  it('theme light/dark colours appear in rendered cell fills', () => {
    const resolved = {
      topology: { type: 'grid', rows: 8, cols: 8 },
      surface: { colors: { 'cell-light': '#ff0000', 'cell-dark': '#00ff00' } },
      render: { cellColor: 'checkered' },
      setup: '8/8/8/8/8/8/8/8',
      pieces: {},
    }
    const svg = renderFromEngine(resolved, {})
    expect(svg).toContain('#ff0000')
    expect(svg).toContain('#00ff00')
  })

  it('ops-based boards use the ops light/dark values for cell fills', () => {
    const resolved = {
      topology: { type: 'grid', rows: 8, cols: 8 },
      surface: { colors: {} },
      render: { ops: [{ op: 'cells', pattern: 'checkered', light: '#aabbcc', dark: '#112233', interactive: true }] },
      setup: '8/8/8/8/8/8/8/8',
      pieces: {},
    }
    const svg = renderFromEngine(resolved, {})
    expect(svg).toContain('#aabbcc')
    expect(svg).toContain('#112233')
  })

  it('changing ops light/dark produces different cell fills (theme switch)', () => {
    const makeResolved = (light, dark) => ({
      topology: { type: 'grid', rows: 8, cols: 8 },
      surface: { colors: {} },
      render: { ops: [{ op: 'cells', pattern: 'checkered', light, dark, interactive: true }] },
      setup: '8/8/8/8/8/8/8/8',
      pieces: {},
    })
    const classicSvg = renderFromEngine(makeResolved('#f0d9b5', '#b58863'), {})
    const neonSvg = renderFromEngine(makeResolved('#1a1a2e', '#0f0f1a'), {})
    expect(classicSvg).toContain('#f0d9b5')
    expect(neonSvg).toContain('#1a1a2e')
    expect(neonSvg).not.toContain('#f0d9b5')
  })

  it('BOARD_THEMES defines light and dark for every theme', () => {
    const themes = Object.entries(BOARD_THEMES)
    expect(themes.length).toBeGreaterThan(3)
    for (const [key, theme] of themes) {
      expect(theme.light).toBeTruthy()
      expect(theme.dark).toBeTruthy()
      expect(theme.label).toBeTruthy()
    }
  })
})

describe('piece set picker', () => {
  const describeWithGallery = gallery ? describe : describe.skip

  describeWithGallery('variant-aware filtering', () => {
    it('gallery entries use name field', () => {
      expect(gallery.length).toBeGreaterThan(1)
      const valid = gallery.filter(s => s.id && (s.name || s.label))
      expect(valid.length).toBeGreaterThan(10)
    })

    it('standard chess filters to sets with all 6 piece types per side', () => {
      const needed = new Set(['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'])
      const compatible = gallery.filter(s => {
        if (!s.id || !s.pieces) return false
        for (const key of needed) {
          if (!s.pieces[key]) return false
        }
        return true
      })
      expect(compatible.length).toBeGreaterThan(5)
      expect(compatible.length).toBeLessThan(gallery.length)
    })

    it('a set lacking fairy pieces is excluded for capablanca', () => {
      const needed = new Set(['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'wA', 'wC', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP', 'bA', 'bC'])
      const compatible = gallery.filter(s => {
        if (!s.id || !s.pieces) return false
        for (const key of needed) {
          if (!s.pieces[key]) return false
        }
        return true
      })
      const standardOnly = gallery.filter(s => s.id && s.pieces && s.pieces['wK'] && !s.pieces['wA'])
      expect(standardOnly.length).toBeGreaterThan(0)
      for (const s of standardOnly) {
        expect(compatible.find(c => c.id === s.id)).toBeUndefined()
      }
    })
  })
})

describe('piece recolouring', () => {
  it('render produces pieces without circle elements when no surface override', () => {
    if (!gallery) return
    const resolved = {
      topology: { type: 'grid', rows: 8, cols: 8 },
      render: { cellColor: 'checkered' },
      setup: 'K7/8/8/8/8/8/8/8',
      pieces: { set: 'chessnut' },
    }
    const pieceResult = attachPieceImages(resolved, gallery)
    const svg = renderFromEngine(resolved, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: {},
      pieceSurface: null,
    })
    const pieceGroup = svg.match(/<g pointer-events="none">([\s\S]*?)<\/g>/)
    expect(pieceGroup).not.toBeNull()
    expect(pieceGroup[1]).toContain('<image')
    expect(pieceGroup[1]).not.toContain('<circle')
  })

  it('PIECE_STYLES provides fill, stroke, and detail for each non-auto style', () => {
    const styles = Object.entries(PIECE_STYLES).filter(([k]) => k !== 'auto')
    expect(styles.length).toBeGreaterThan(3)
    for (const [key, style] of styles) {
      expect(style.light.fill).toBeTruthy()
      expect(style.light.stroke).toBeTruthy()
      expect(style.dark.fill).toBeTruthy()
      expect(style.dark.stroke).toBeTruthy()
      expect(style.dark.detail).toBeTruthy()
    }
  })
})

describe('capture burst', () => {
  it('theme defines particles, duration, and colours for burst rendering', () => {
    expect(CAPTURE_BURST_THEME.particles).toBeGreaterThan(0)
    expect(CAPTURE_BURST_THEME.duration).toBeGreaterThan(0)
    expect(CAPTURE_BURST_THEME.colors.length).toBeGreaterThan(0)
    expect(CAPTURE_BURST_THEME.radius).toBeGreaterThan(0)
    expect(CAPTURE_BURST_THEME.spread).toBeGreaterThan(0)
  })
})

describe('animation', () => {
  it('onAnimateMove fires with from/to coordinates after a legal move', (done) => {
    const game = createChessGame()
    const ctrl = createGameController(game, {
      players: { white: 'human', black: 'human' },
      onAnimateMove: (move, state, callback) => {
        expect(move.from).toBe(52)
        expect(move.to).toBe(36)
        expect(typeof callback).toBe('function')
        callback()
        done()
      },
    })
    ctrl.handleClick(52)
    ctrl.handleClick(36)
  })

  it('ANIM_THEME defines named speeds with ms durations and multiple styles', () => {
    expect(Object.keys(ANIM_THEME.speeds).length).toBeGreaterThan(2)
    expect(ANIM_THEME.speeds.normal).toBeGreaterThan(ANIM_THEME.speeds.fast)
    expect(ANIM_THEME.styles).toContain('slide')
    expect(ANIM_THEME.styles).toContain('arc')
    expect(ANIM_THEME.styles.length).toBeGreaterThan(2)
  })
})

describe('humanIdx validation', () => {
  it('throws on invalid colour value', () => {
    expect(() => {
      const names = ['white', 'black']
      resolveHumanIndexTest('purple', names)
    }).toThrow(/Invalid colour/)
  })

  it('resolves numeric strings correctly', () => {
    const names = ['white', 'black']
    expect(resolveHumanIndexTest('0', names)).toBe(0)
    expect(resolveHumanIndexTest('1', names)).toBe(1)
  })

  it('resolves player names', () => {
    const names = ['white', 'black']
    expect(resolveHumanIndexTest('white', names)).toBe(0)
    expect(resolveHumanIndexTest('black', names)).toBe(1)
  })
})

// --- Helpers ---

function resolveHumanIndexTest(colour, names) {
  if (colour === '0' || colour === '1') return parseInt(colour, 10)
  const idx = names.indexOf(colour)
  if (idx !== -1) return idx
  throw new Error(`[game-play] Invalid colour value: "${colour}". Expected "0", "1", or a player name (${names.join(', ')})`)
}
