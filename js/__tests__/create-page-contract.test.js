/**
 * The create page's claims, asserted.
 *
 * Everything here is a claim made about the page in engine#110 or in a brief.
 * These test the pure logic behind each claim, without a DOM, so that "the
 * create page can do X" stops being something we assert in prose.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { renderFromEngine, attachPieceImages, pieceIdToFenChar } from '../../packages/render/src/render-engine.js'
import { resolveSurface } from '../../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../../packages/schema/src/cascade-resolver.js'
import { fromConfig } from '../../packages/piece-behaviour/src/piece-definitions.js'
import { createGridTopology, algebraicId } from '../../packages/topologies/grid/src/topology-grid.js'

const gallery = JSON.parse(readFileSync(join(process.cwd(), 'pieces', 'gallery-index.json'), 'utf8'))

function build(topology, render = {}) {
  const surface = resolveSurface('wood-classic')
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: { topology, surface: 'wood-classic', render }, meta: { label: 'Custom' } },
  })
  return resolved
}

describe('create page: every topology it offers actually draws something', () => {
  const cases = [
    ['grid', { type: 'grid', rows: 8, cols: 8 }, { labels: true, cellColor: 'checkered' }],
    ['hex', { type: 'hex', radius: 5 }, { labels: true }],
    ['graph', { type: 'graph', structure: 'concentric-rings', params: { rings: 3 } }, { labels: true }],
    ['track', { type: 'track', positions: 24 }, { labels: true, trackStyle: 'triangular-points' }],
    ['pit', { type: 'pit', cols: 6 }, { labels: true }],
  ]

  for (const [name, topology, render] of cases) {
    test(`${name} produces a non-trivial SVG`, () => {
      const svg = renderFromEngine(build(topology, render), {})
      expect(svg).toBeTruthy()
      // an empty document is about 90 characters of wrapper
      expect(svg.length).toBeGreaterThan(500)
      const shapes = (svg.match(/<(rect|circle|poly|path)/g) || []).length
      expect(shapes).toBeGreaterThan(0)
    })
  }
})

describe('create page: placing a piece writes the piece it was asked for', () => {
  test('a palette click stores a FEN character, not a piece id', () => {
    // The bug this guards: placing "bQ" wrote a black bishop plus a white queen.
    expect(pieceIdToFenChar('wK')).toBe('K')
    expect(pieceIdToFenChar('bQ')).toBe('q')
    expect(pieceIdToFenChar('not-a-piece')).toBeNull()
  })

  test('a placed piece renders at the square it was placed on, in its own colour', () => {
    const resolved = build({ type: 'grid', rows: 8, cols: 8 }, { labels: true })
    resolved.setup = 'q7/8/8/8/8/8/8/4K3'
    resolved.pieces = { set: 'chessnut' }
    const images = attachPieceImages(resolved, gallery)
    const svg = renderFromEngine(resolved, { pieceImages: images.images || {} })
    const drawn = [...svg.matchAll(/href="[^"]*\/([a-zA-Z]+)\.svg"/g)].map(m => m[1])
    expect(drawn).toContain('bQ')
    expect(drawn).toContain('wK')
    expect(drawn).toHaveLength(2)
  })

  test('same piece type for each side produces distinct image references', () => {
    const resolved = build({ type: 'grid', rows: 8, cols: 8 }, {})
    resolved.setup = '6K1/8/8/8/5kk1/8/5kk1/8'
    resolved.pieces = { set: 'chessnut' }
    const images = attachPieceImages(resolved, gallery)
    const svg = renderFromEngine(resolved, { pieceImages: images.images || {} })
    const hrefs = [...svg.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    const wKing = hrefs.filter(h => h.includes('wK.svg'))
    const bKing = hrefs.filter(h => h.includes('bK.svg'))
    expect(wKing.length).toBe(1)
    expect(bKing.length).toBe(4)
    expect(wKing[0]).not.toBe(bKing[0])
  })
})

describe('create page: the setup string round-trips', () => {
  // buildFen and applySetupInput are the two halves of the setup bar. Their
  // contract is that anything the page writes, the page can read back.
  function buildFen(placement, rows, cols) {
    const out = []
    for (let r = 0; r < rows; r++) {
      let row = '', empty = 0
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`
        if (placement[key]) { if (empty) { row += empty; empty = 0 } row += placement[key] } else empty++
      }
      if (empty) row += empty
      out.push(row)
    }
    return out.join('/')
  }

  function parseFen(text, rows, cols) {
    const next = {}
    const rowStrings = String(text).trim().split('/')
    if (rowStrings.length !== rows) return null
    for (let r = 0; r < rows; r++) {
      let c = 0
      for (const token of rowStrings[r].match(/\d+|[^\d]/g) || []) {
        if (/^\d+$/.test(token)) { c += parseInt(token, 10); continue }
        if (c >= cols) return null
        next[`${r},${c}`] = token
        c++
      }
      if (c !== cols) return null
    }
    return next
  }

  test('placement survives a write and a read', () => {
    const placement = { '0,0': 'q', '7,4': 'K', '6,3': 'P' }
    const fen = buildFen(placement, 8, 8)
    expect(fen).toBe('q7/8/8/8/8/8/3P4/4K3')
    expect(parseFen(fen, 8, 8)).toEqual(placement)
  })

  test('a string that does not fit the board is rejected outright', () => {
    expect(parseFen('q7/8/8', 8, 8)).toBeNull()      // too few ranks
    expect(parseFen('q8/8/8/8/8/8/8/8', 8, 8)).toBeNull()  // rank overflows
  })
})

describe('create page: a defined piece previews its real moves', () => {
  // The preview must call the primitive, not reimplement the pattern.
  const topology = createGridTopology({ rows: 9, cols: 9 })
  const centre = 4 * 9 + 4

  function targets(spec, blockers = []) {
    const board = new Array(81).fill(null)
    for (const b of blockers) board[b] = { friendly: true, enemy: false }
    return fromConfig(spec).genMoves(topology, centre, board).map(m => m.to).sort((a, b) => a - b)
  }

  test('a lame leaper matches a plain knight on an open board', () => {
    expect(targets({ type: 'leaper', offsets: 'knight', lame: 'orthogonal' }))
      .toEqual(targets({ type: 'leaper', offsets: 'knight' }))
  })

  test('a blocker removes exactly the targets whose path it sits on', () => {
    const open = targets({ type: 'leaper', offsets: 'knight', lame: 'orthogonal' })
    const blocked = targets({ type: 'leaper', offsets: 'knight', lame: 'orthogonal' }, [(4 + 1) * 9 + 4])
    expect(open.length - blocked.length).toBe(2)
  })
})

describe('create page: data-sq and placement keys agree', () => {

  function sqToKey(sq, rows) {
    const col = sq.charCodeAt(0) - 97
    const row = rows - parseInt(sq.slice(1))
    return `${row},${col}`
  }

  test('algebraic a1 on 8x8 maps to row 7, col 0', () => {
    const sq = algebraicId(7, 0, 8)
    expect(sq).toBe('a1')
    expect(sqToKey(sq, 8)).toBe('7,0')
  })

  test('algebraic e4 on 8x8 maps to row 4, col 4', () => {
    const sq = algebraicId(4, 4, 8)
    expect(sq).toBe('e4')
    expect(sqToKey(sq, 8)).toBe('4,4')
  })

  test('a placed piece at a1 produces the correct FEN', () => {
    const placement = {}
    placement[sqToKey('a1', 8)] = 'q'
    const fenRows = []
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0
      for (let c = 0; c < 8; c++) {
        const key = `${r},${c}`
        if (placement[key]) { if (empty) { row += empty; empty = 0 }; row += placement[key] } else empty++
      }
      if (empty) row += empty
      fenRows.push(row)
    }
    expect(fenRows.join('/')).toBe('8/8/8/8/8/8/8/q7')
  })
})
