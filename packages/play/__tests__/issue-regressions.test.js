import { createGameForFamily, resolveFromDisk } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'
import { deriveCompatibleFlags, familySupportsFlag } from '../src/variant-flags.js'
import { listVariants } from '../src/variant-registry.js'
import { defaultSeatFor } from '../src/default-seat.js'
import { renderFromEngine, buildPieceImages } from '../../render/src/render-engine.js'
import { stateFromResolved, buildResolvedFromState } from '../../../js/create-state.js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
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

// The river marker is the only <text> the renderer emits in serif; coordinate
// labels are monospace. The original version of these tests counted every
// <text> element on the board and recomputed the expected y from cellSize and
// an assumed inset. Both were proxies, and both broke the moment the xiangqi
// rulebook declared `render.labels: true`: 19 coordinate labels appeared, and
// the label pad shifted the whole grid down by 24px so the recomputed y was
// 184.9 against a correct 208.9. The render was right the entire time. Two
// tests sat red on dev looking like #125 had reopened.
//
// These assert the invariant #125 is actually about - the marker sits in the
// river - and measure the river from the board the renderer drew rather than
// duplicating its arithmetic, so padding, cell size and labels cannot break
// them again.
function riverTexts(svg) {
  return [...svg.matchAll(/<text[^>]*font-family="serif"[^>]*>([^<]*)</g)]
    .map(m => m[0])
}

function gridRowYs(svg) {
  const horizontal = [...svg.matchAll(/<line[^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/g)]
    .filter(m => m[1] === m[2])
    .map(m => parseFloat(m[1]))
  return [...new Set(horizontal)].sort((a, b) => a - b)
}

describe('#125 — river text placement', () => {
  test('standard xiangqi puts both river markers in the river', () => {
    const resolved = resolveFromDisk('xiangqi', 'standard')
    const svg = renderFromEngine(resolved, { pieceImages: {} })

    const markers = riverTexts(svg)
    expect(markers).toHaveLength(2)

    const rows = gridRowYs(svg)
    expect(rows.length).toBeGreaterThanOrEqual(10)

    // The river lies between the fifth and sixth rank lines.
    const riverMid = (rows[4] + rows[5]) / 2
    const cellSize = rows[1] - rows[0]
    const baselineDrop = Math.min(cellSize * 0.45, 14) * 0.35

    for (const marker of markers) {
      const y = parseFloat(marker.match(/y="([\d.]+)"/)[1])
      expect(Math.abs(y - (riverMid + baselineDrop))).toBeLessThan(0.5)
    }
  })

  test('xiangqi-42 has no river, so emits no river markers', () => {
    const resolved = resolveFromDisk('xiangqi', 'xiangqi-42')
    const svg = renderFromEngine(resolved, { pieceImages: {} })
    expect(riverTexts(svg)).toHaveLength(0)
  })

  // Counting every <text> is what made the originals brittle. Assert instead
  // that the two kinds stay distinguishable, so a future change that renders
  // the river marker in the label font fails here rather than silently making
  // the checks above vacuous.
  // #125's own body listed janggi as a follow-up. Korean chess has no river,
  // but janggi declared no render block, so it inherited the xiangqi family's
  // split grid-lines op and 楚河漢界 decorations and was drawn as a Chinese
  // board. No test could have discovered that fact - which games have rivers is
  // content knowledge, not something an assertion can derive.
  //
  // What a test can do is make the declaration binding. `render.river: false`
  // was accepted in frontmatter and read by nothing, so stating the fact had no
  // effect. Now that it does, this asserts declaration and render agree across
  // the whole family, in both directions: a board that says it has no river
  // must not draw one, and one that says it has must.
  test('every variant renders the river it declares', () => {
    const rulesRoot = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
    const slugs = readdirSync(join(rulesRoot, 'xiangqi', 'content', 'variants'))
      .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
    expect(slugs.length).toBeGreaterThan(5)

    const disagreements = []
    let checked = 0
    for (const slug of slugs) {
      const resolved = resolveFromDisk('xiangqi', slug)
      if (!resolved) continue
      let svg
      try { svg = renderFromEngine(resolved, { pieceImages: {} }) } catch { continue }
      if (!svg) continue
      checked++

      const declaresRiver = resolved.render?.river !== false
      const drawsRiver = riverTexts(svg).length > 0

      // A variant may legitimately declare no river decorations of its own
      // (minixiangqi, quang-trung), so only a board claiming a river and
      // inheriting the family's markers is required to draw them.
      const inheritsMarkers = (resolved.render?.decorations || [])
        .some(d => d.type === 'texts' && (d.items || []).some(i => String(i.position || '').startsWith('river')))

      if (!declaresRiver && drawsRiver) disagreements.push(`${slug}: river: false but markers drawn`)
      if (declaresRiver && inheritsMarkers && !drawsRiver) disagreements.push(`${slug}: declares a river and inherits markers but draws none`)
    }
    expect(checked).toBeGreaterThan(5)
    expect(disagreements).toEqual([])
  })

  test('river markers and coordinate labels use distinct fonts', () => {
    const svg = renderFromEngine(resolveFromDisk('xiangqi', 'standard'), { pieceImages: {} })
    const labels = [...svg.matchAll(/<text[^>]*font-family="monospace"[^>]*>/g)]
    expect(labels.length).toBeGreaterThan(0)
    expect(riverTexts(svg).length).toBeGreaterThan(0)
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
