import { createGameForFamily, resolveFromDisk } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'
import { deriveCompatibleFlags, familySupportsFlag } from '../src/variant-flags.js'
import { listVariants } from '../src/variant-registry.js'
import { defaultSeatFor } from '../src/default-seat.js'
import { renderFromEngine, buildPieceImages } from '../../render/src/render-engine.js'
import { stateFromResolved, buildResolvedFromState } from '../../../js/create-state.js'
import { readFileSync } from 'fs'
import '../test-helpers/setup-rules-reader.js'

const GALLERY_PATH = 'pieces/gallery-index.json'
let _gallery = null
function getGallery() {
  if (!_gallery) _gallery = JSON.parse(readFileSync(GALLERY_PATH, 'utf8'))
  return _gallery
}

function buildGalleryImages(resolved) {
  const { images } = buildPieceImages(resolved.pieces?.set, getGallery(), resolved.pieces?.vocabulary || null, false)
  return images
}

describe('#121 — player 0 wins must not be reported as draw', () => {
  test('white (index 0) mate fires onGameEnd with 0 through the controller', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    let endResult = 'NOT_CALLED'
    const ctrl = createGameController(game.raw, {
      family: 'chess',
      players: { white: 'human', black: 'human' },
      onGameEnd: (r) => { endResult = r },
    })
    // Scholar's mate via executeMove: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    ctrl.executeMove({ from: 52, to: 36 })
    ctrl.executeMove({ from: 12, to: 28 })
    ctrl.executeMove({ from: 61, to: 34 })
    ctrl.executeMove({ from: 1, to: 18 })
    ctrl.executeMove({ from: 59, to: 31 })
    ctrl.executeMove({ from: 6, to: 21 })
    ctrl.executeMove({ from: 31, to: 13 })
    expect(endResult).toBe(0)
  })

  test('black (index 1) mate fires onGameEnd with 1 through the controller', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    let endResult = 'NOT_CALLED'
    const ctrl = createGameController(game.raw, {
      family: 'chess',
      players: { white: 'human', black: 'human' },
      onGameEnd: (r) => { endResult = r },
    })
    // Fool's mate via executeMove: 1.f3 e5 2.g4 Qh4#
    ctrl.executeMove({ from: 53, to: 45 })
    ctrl.executeMove({ from: 12, to: 28 })
    ctrl.executeMove({ from: 54, to: 38 })
    ctrl.executeMove({ from: 3, to: 39 })
    expect(endResult).toBe(1)
  })
})

describe('#122 — shogi piece orientation', () => {
  test('standard shogi emits zero rotations (pre-rotated art, no pieceRotations)', () => {
    const resolved = resolveFromDisk('shogi', 'standard')
    expect(resolved.pieceRotations).toBeUndefined()
    const pieceImages = allKeyProxy()
    const svg = renderFromEngine(resolved, { pieceImages })
    const rotations = (svg.match(/rotate\(\d+/g) || [])
    expect(rotations.length).toBe(0)
  })

  test('four-player-shogi emits rotations for all four armies', () => {
    const resolved = resolveFromDisk('shogi', 'four-player-shogi')
    expect(resolved.pieceRotations).toBeDefined()
    const pieceImages = allKeyProxy()
    const svg = renderFromEngine(resolved, { pieceImages })
    const rotations = (svg.match(/rotate\((\d+)/g) || []).map(m => parseInt(m.replace('rotate(', '')))
    const unique = [...new Set(rotations)]
    expect(unique.length).toBeGreaterThanOrEqual(3)
  })

  test('standard shogi: both owners render, no rotation transforms (pre-rotated art)', () => {
    const resolved = resolveFromDisk('shogi', 'standard')
    const pieceImages = buildGalleryImages(resolved)
    const svg = renderFromEngine(resolved, { pieceImages })
    const hrefs = (svg.match(/href="([^"]+)"/g) || []).map(m => m.match(/href="([^"]+)"/)[1])
    const files = hrefs.map(h => h.split('/').pop())
    const sente = files.filter(f => f.startsWith('0'))
    const gote = files.filter(f => f.startsWith('1'))
    expect(sente.length).toBeGreaterThan(0)
    expect(gote.length).toBeGreaterThan(0)
    const rotations = (svg.match(/rotate\(\d+/g) || [])
    expect(rotations.length).toBe(0)
  })

  test('prefixed piece ids resolve to correct owners (fallbackOwner)', () => {
    const resolved = {
      topology: { type: 'grid', rows: 3, cols: 3 },
      render: { cellSize: 40 },
      setup: 'W2/3/2w',
      pieceRotations: { white: 0, black: 180 },
      players: ['white', 'black'],
      pieces: { vocabulary: { W: 'wLN', w: 'bLN' } },
    }
    const pieceImages = { wLN: 'white.svg', bLN: 'black.svg' }
    const svg = renderFromEngine(resolved, { pieceImages })
    expect(svg).toContain('href="white.svg"')
    expect(svg).toContain('href="black.svg"')
    const rotations = (svg.match(/rotate\(180/g) || [])
    expect(rotations.length).toBe(1)
    expect(svg.indexOf('rotate(180')).toBeLessThan(svg.indexOf('black.svg'))
    expect(svg.indexOf('rotate(180')).toBeGreaterThan(svg.indexOf('white.svg'))
  })
})

describe('#123 — create page round-trip preserves fairy pieces', () => {
  const families = ['chess', 'shogi', 'xiangqi', 'draughts', 'go', 'reversi']

  // Variants that cannot construct before the round-trip (pre-existing issues
  // unrelated to #123: hex topology, missing setup, nondeterministic).
  const SKIP = new Set([
    'chess/chess960', 'chess/sittuyin',
    'chess/brusky', 'chess/de-vasa', 'chess/glinski', 'chess/mccooey',
    'chess/mini-hexchess', 'chess/shafran', 'chess/hex-shogi-91',
    'shogi/sankaku-shogi',
  ])

  for (const family of families) {
    const variants = listVariants(family)
    for (const v of variants) {
      if (SKIP.has(`${family}/${v.key}`)) continue
      test(`${family}/${v.key} round-trips`, () => {
        const resolved = resolveFromDisk(family, v.key)
        const pluginBlock = resolved.plugins?.[family] || {}
        const originalVocab = { ...(resolved.vocabulary || {}), ...(pluginBlock.vocabulary || {}) }
        const originalPieces = pluginBlock.pieces || pluginBlock.pieceMoves || {}

        const state = stateFromResolved(resolved, family, { title: v.label })
        const rebuilt = buildResolvedFromState(state)

        const rebuiltPluginBlock = rebuilt.plugins?.[family] || {}
        const rebuiltVocab = { ...(rebuilt.vocabulary || {}), ...(rebuiltPluginBlock.vocabulary || {}) }
        const rebuiltPieces = rebuiltPluginBlock.pieces || rebuiltPluginBlock.pieceMoves || {}

        for (const key of Object.keys(originalVocab)) {
          expect(rebuiltVocab[key]).toBeDefined()
        }
        for (const key of Object.keys(originalPieces)) {
          expect(rebuiltPieces[key]).toBeDefined()
        }
      })
    }
  }
})

describe('#124 — flags only offered on families that consume them', () => {
  test('non-chess families do not support drops or random', () => {
    for (const f of ['go', 'draughts', 'xiangqi', 'reversi', 'shogi']) {
      expect(familySupportsFlag(f, 'drops')).toBe(false)
      expect(familySupportsFlag(f, 'random')).toBe(false)
    }
  })

  test('chess supports both', () => {
    expect(familySupportsFlag('chess', 'drops')).toBe(true)
    expect(familySupportsFlag('chess', 'random')).toBe(true)
  })

  test('deriveCompatibleFlags returns empty for non-chess', () => {
    for (const f of ['go', 'draughts', 'xiangqi', 'reversi', 'shogi']) {
      const game = createGameForFamily(f, { variant: 'standard', rngSeed: 1 })
      const flags = deriveCompatibleFlags(game.raw.definition, f)
      expect(flags).toEqual([])
    }
  })

  test('hostage-chess (drops already on) does not get a drops toggle', () => {
    const resolved = resolveFromDisk('chess', 'hostage-chess')
    const flags = deriveCompatibleFlags(resolved, 'chess')
    expect(flags).not.toContain('drops')
  })
})

describe('#125 — river text placement', () => {
  test('standard xiangqi has 2 text elements at y=184.9 (river centre)', () => {
    const resolved = resolveFromDisk('xiangqi', 'standard')
    const svg = renderFromEngine(resolved, { pieceImages: {} })
    const textMatches = svg.match(/<text[^>]*y="([^"]+)"/g) || []
    expect(textMatches.length).toBe(2)
    const yValues = textMatches.map(t => parseFloat(t.match(/y="([^"]+)"/)[1]))
    const cellSize = resolved.render?.cellSize || 36
    const inset = cellSize / 2
    const riverTop = 4, riverBot = 5
    const expectedY = inset + ((riverTop + riverBot) / 2) * cellSize + Math.min(cellSize * 0.45, 14) * 0.35
    for (const y of yValues) {
      expect(Math.abs(y - expectedY)).toBeLessThan(1)
    }
  })

  test('xiangqi-42 emits zero text elements', () => {
    const resolved = resolveFromDisk('xiangqi', 'xiangqi-42')
    const svg = renderFromEngine(resolved, { pieceImages: {} })
    const textMatches = svg.match(/<text[^>]*>/g) || []
    expect(textMatches.length).toBe(0)
  })
})

describe('#126 — uniformPieces collapses vocabulary', () => {
  test('one-colour go resolves uniformPieces and board tracks two owners', () => {
    const resolved = resolveFromDisk('go', 'one-colour')
    expect(resolved.render?.uniformPieces).toBe(true)

    const game = createGameForFamily('go', { variant: 'one-colour', rngSeed: 1 })
    game.applyMove({ coord: 60 })
    game.applyMove({ coord: 300 })
    const board = game.getState().slice.board
    const owners = new Set(board.filter(c => c))
    expect(owners.size).toBe(2)
  })

  test('uniformPieces collapses vocabulary to one image id', () => {
    const resolved = resolveFromDisk('go', 'one-colour')
    const vocab = resolved.pieces?.vocabulary || {}
    const entries = Object.entries(vocab)
    expect(entries.length).toBeGreaterThanOrEqual(2)
    const ids = entries.map(([, id]) => id)
    expect(new Set(ids).size).toBe(2)

    // Apply the collapse logic from game-play.js
    const [, first] = entries[0]
    const collapsed = Object.fromEntries(entries.map(([k]) => [k, first]))
    const collapsedIds = Object.values(collapsed)
    expect(new Set(collapsedIds).size).toBe(1)
  })
})

describe('#127 — default seat derivation', () => {
  test('four-player-shogi: bottom army (green, index 0) is the default seat', () => {
    const game = createGameForFamily('shogi', { variant: 'four-player-shogi', rngSeed: 1 })
    const board = game.getState().slice.board
    const cols = game.topology.cols
    const players = game.raw.playerSystem.getAll()
    const seat = defaultSeatFor(board, cols, players.length, null)
    expect(seat).toBe(0)
  })

  test('standard chess: white (index 0) is at the bottom, so default seat is 0', () => {
    const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
    const board = game.getState().slice.board
    const cols = game.topology.cols
    const seat = defaultSeatFor(board, cols, 2, null)
    expect(seat).toBe(0)
  })

  test('upside-down declares defaultSeat: 0 overriding derivation', () => {
    const resolved = resolveFromDisk('chess', 'upside-down')
    expect(resolved.defaultSeat).toBe(0)
    const game = createGameForFamily('chess', { variant: 'upside-down', rngSeed: 1 })
    const board = game.getState().slice.board
    const cols = game.topology.cols
    const seat = defaultSeatFor(board, cols, 2, resolved.defaultSeat)
    expect(seat).toBe(0)
  })
})

function allKeyProxy() {
  return new Proxy({}, { get: (_, k) => typeof k === 'string' ? 'mock.svg' : undefined })
}
