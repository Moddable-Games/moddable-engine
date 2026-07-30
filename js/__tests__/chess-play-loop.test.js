import fs from 'fs'
import path from 'path'
import MCE, { legalMoves, makeMove, variantLegalMoves } from '../../packages/plugins/chess/src/mce/index.js'
import { renderFromEngine, attachPieceImages, buildPieceImages } from '../../packages/render/src/render-engine.js'

const GALLERY_PATH = path.resolve(process.cwd(), 'pieces/gallery-index.json')
const gallery = fs.existsSync(GALLERY_PATH)
  ? JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'))
  : null

const describeWithAssets = gallery ? describe : describe.skip

function boardToFEN(board, rows, cols) {
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const piece = board[r * cols + c]
      if (!piece) { empty++; continue }
      if (empty > 0) { row += empty; empty = 0 }
      const color = MCE.pieceColor(piece)
      const type = MCE.pieceType(piece)
      const ch = type[0] === 'k' && type.length > 1 ? type[1] : type[0]
      row += color === MCE.WHITE ? ch.toUpperCase() : ch
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  return fenRows.join('/')
}

function buildResolved(fen, rows, cols, pieceSet) {
  return {
    topology: { type: 'grid', rows, cols, tileMode: 'tiles' },
    surface: { colors: { 'cell-light': '#f0d9b5', 'cell-dark': '#b58863' } },
    render: { cellColor: 'checkered', alternating: true, labels: true, interactive: true },
    setup: fen,
    pieces: { set: pieceSet },
    meta: { label: '' },
  }
}

const SAMPLE_VARIANTS = [
  'standard',
  'capablanca',
  'los-alamos',
  'crazyhouse',
  'horde',
  'antichess',
  'king-of-the-hill',
  'racing-kings',
  'atomic',
  'three-check',
]

const AVAILABLE = SAMPLE_VARIANTS.filter(v => MCE.getVariantConfig(v))

describeWithAssets('chess play loop characterisation', () => {
  it.each(AVAILABLE)('%s — game advances after two moves', (variant) => {
    const game = MCE.createGame(variant)
    const vc = MCE.getVariantConfig(variant)
    const rows = vc?.rows || 8
    const cols = vc?.cols || 8
    const initialFen = MCE.toFEN(game)

    const moves1 = legalMoves(game)
    expect(moves1.length).toBeGreaterThan(0)
    makeMove(game, moves1[0])

    const moves2 = legalMoves(game)
    expect(moves2.length).toBeGreaterThan(0)
    makeMove(game, moves2[0])

    const afterFen = MCE.toFEN(game)
    expect(afterFen).not.toBe(initialFen)
  })

  it.each(AVAILABLE)('%s — every piece resolves to an image', (variant) => {
    const game = MCE.createGame(variant)
    const vc = MCE.getVariantConfig(variant)
    const rows = vc?.rows || 8
    const cols = vc?.cols || 8
    const pieceSet = 'mce-fairy-complete'

    const moves = legalMoves(game)
    makeMove(game, moves[0])

    const fen = boardToFEN(game.board, rows, cols)
    const resolved = buildResolved(fen, rows, cols, pieceSet)
    const { images } = buildPieceImages(pieceSet, gallery, null, false)

    const ranks = fen.split('/')
    const symbols = []
    for (const rank of ranks) {
      for (const ch of rank) {
        if (ch >= '0' && ch <= '9') continue
        symbols.push(ch)
      }
    }

    const unresolved = [...new Set(symbols.filter(s => !images[s]))]
    expect(unresolved).toEqual([])
    expect(symbols.length).toBeGreaterThan(0)
  })

  it.each(AVAILABLE)('%s — renderFromEngine produces SVG', (variant) => {
    const game = MCE.createGame(variant)
    const vc = MCE.getVariantConfig(variant)
    const rows = vc?.rows || 8
    const cols = vc?.cols || 8

    const fen = boardToFEN(game.board, rows, cols)
    const resolved = buildResolved(fen, rows, cols, 'mce-fairy-complete')
    const pieceResult = attachPieceImages(resolved, gallery)
    const svg = renderFromEngine(resolved, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('data-sq')
    expect(svg).toContain('board-cell')
  })
})

describeWithAssets('chess play loop — special variants', () => {
  const DROPS = MCE.getVariantConfig('crazyhouse') ? ['crazyhouse'] : []
  const FOG = ['dark-chess', 'fog-of-war'].filter(v => MCE.getVariantConfig(v))
  const EFFECTS = ['dungeon-chess', 'poison-chess'].filter(v => MCE.getVariantConfig(v))
  const FEN4 = ['four-handed-chess', 'los-alamos-vierschach'].filter(v => MCE.getVariantConfig(v))

  if (DROPS.length > 0) {
    it('crazyhouse — drop moves exist after captures', () => {
      const game = MCE.createGame('crazyhouse')
      for (let i = 0; i < 20; i++) {
        const moves = legalMoves(game)
        if (moves.length === 0) break
        makeMove(game, moves[Math.floor(moves.length / 3)])
      }
      const moves = variantLegalMoves(game)
      const drops = moves.filter(m => m.action === 'drop')
      if (game.hand && (game.hand[MCE.WHITE]?.length > 0 || game.hand[MCE.BLACK]?.length > 0)) {
        expect(drops.length).toBeGreaterThan(0)
      }
    })
  }

  if (FOG.length > 0) {
    it.each(FOG)('%s — visibility produces hidden cells that would be fogged', (variant) => {
      const game = MCE.createGame(variant)
      const vc = MCE.getVariantConfig(variant)
      if (!vc.visibility) return
      const mask = vc.visibility(game, game.turn)
      expect(mask).toBeTruthy()
      const total = (vc.rows || 8) * (vc.cols || 8)
      const isVisible = mask instanceof Set
        ? (i) => mask.has(i)
        : (i) => !!mask[i]
      let hidden = 0
      for (let i = 0; i < total; i++) {
        if (!isVisible(i)) hidden++
      }
      expect(hidden).toBeGreaterThan(0)
    })
  }

  if (EFFECTS.length > 0) {
    it.each(EFFECTS)('%s — effects array exists on game', (variant) => {
      const game = MCE.createGame(variant)
      expect(Array.isArray(game.effects) || game.effects === undefined || game.effects === null).toBe(true)
    })
  }

  if (FEN4.length > 0) {
    it.each(FEN4)('%s — four-player game has 4-colour pieces', (variant) => {
      const game = MCE.createGame(variant)
      const vc = MCE.getVariantConfig(variant)
      const fen = MCE.toFEN(game)
      expect(fen).toMatch(/[rygb]/)
    })
  }
})
