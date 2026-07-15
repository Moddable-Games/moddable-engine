/**
 * renderFromEngine — renders SVG directly from a resolved cascade object.
 *
 * This is the single entry point for frontmatter → SVG. No adapter, no flat opts,
 * no translation layers. Takes the resolved cascade (topology + surface + render + setup)
 * and produces an SVG string.
 */

import { produceLayout } from '../../schema/src/produce-layout.js'
import { renderGridLayout } from '../../topologies/grid/src/topology-grid.js'
import { renderGraphLayout } from '../../topologies/graph/src/topology-graph.js'
import { renderPitLayout } from '../../topologies/pit/src/topology-pit.js'
import { renderTrackLayout } from '../../topologies/track/src/topology-track.js'
import { renderHexLayout } from '../../topologies/hex/src/topology-hex.js'
import { elementsToFragment, elementToSvg } from './serialize-layout.js'
import { renderSurfaceSVG } from './piece-surface.js'

const RENDER_FN = { grid: renderGridLayout, graph: renderGraphLayout, pit: renderPitLayout, track: renderTrackLayout, hex: renderHexLayout }

// --- Piece image resolution ---

const FEN_TO_PIECE_ID = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
  A: 'wA', a: 'bA', C: 'wC', c: 'bC', D: 'wD', d: 'bD',
  E: 'wE', e: 'bE', F: 'wF', f: 'bF', G: 'wG', g: 'bG',
  H: 'wH', h: 'bH', I: 'wI', i: 'bI', J: 'wJ', j: 'bJ',
  L: 'wL', l: 'bL', M: 'wM', m: 'bM', O: 'wO', o: 'bO',
  S: 'wS', s: 'bS', T: 'wT', t: 'bT', U: 'wU', u: 'bU',
  V: 'wV', v: 'bV', W: 'wW', w: 'bW', Y: 'wY', y: 'bY',
  Z: 'wZ', z: 'bZ',
}

function resolvePieceEntry(pieceId, entry, setId, baseSetId) {
  if (typeof entry === 'string') {
    const dir = baseSetId || setId
    return baseSetId ? `../pieces/sets/${dir}/${entry}#${pieceId}` : `../pieces/sets/${dir}/${entry}`
  }
  if (entry && entry.source && entry.file) return `../pieces/sets/${entry.source}/${entry.file}`
  return null
}

export function buildPieceImages(pieceSetId, gallery, fenOverrides, skipFenMap) {
  if (!pieceSetId || !gallery) return { images: {}, surfaceMap: {}, surface: null }
  const setDef = gallery.find(s => s.id === pieceSetId)
  if (!setDef) return { images: {}, surfaceMap: {}, surface: null }
  const images = {}
  const surfaceMap = {}
  const surface = setDef.surface || null

  if (setDef.extends) {
    const baseDef = gallery.find(s => s.id === setDef.extends)
    if (baseDef) {
      for (const [pieceId, entry] of Object.entries(baseDef.pieces || {})) {
        const path = resolvePieceEntry(pieceId, entry, baseDef.id)
        if (path) images[pieceId] = path
        if (typeof entry === 'object' && entry.surface) surfaceMap[pieceId] = entry.surface
      }
    }
  }

  for (const [pieceId, entry] of Object.entries(setDef.pieces || {})) {
    const path = resolvePieceEntry(pieceId, entry, pieceSetId, setDef.baseSet || null)
    if (path) images[pieceId] = path
    if (typeof entry === 'object' && entry.surface) surfaceMap[pieceId] = entry.surface
  }

  if (!skipFenMap) {
    const fenMap = fenOverrides || FEN_TO_PIECE_ID
    for (const [fenChar, pieceId] of Object.entries(fenMap)) {
      if (images[pieceId]) images[fenChar] = images[pieceId]
      if (surfaceMap[pieceId]) surfaceMap[fenChar] = surfaceMap[pieceId]
    }
  }

  return { images, surfaceMap, surface }
}

export function attachPieceImages(resolved, gallery) {
  if (!resolved.pieces?.set || !gallery) return {}
  const topo = resolved.topology || {}
  const skipFenMap = topo.type === 'pit'
  const fenOverrides = resolved.pieces.fenMap || null
  return buildPieceImages(resolved.pieces.set, gallery, fenOverrides, skipFenMap)
}

// --- Main render function ---

export function renderFromEngine(resolved, opts = {}) {
  const topo = resolved.topology || {}
  if (!topo.type) return null

  // Clone render to prevent mutation leaking across calls (shared family references)
  const render = { ...(resolved.render || {}) }
  resolved = { ...resolved, render }
  const surface = resolved.surface || {}

  // Multi-board: composite multiple boards
  let layers = render.layers || null
  if (!layers && (topo.layers || topo.boards) && Array.isArray(resolved.setup)) {
    const count = topo.layers || topo.boards
    layers = {
      count,
      layout: count <= 2 ? 'horizontal' : 'vertical',
      labels: topo.layer_labels || [],
      fens: resolved.setup,
      ...(render.layerColors && { colors: render.layerColors }),
    }
  }
  if (layers) {
    return renderMultiBoards(resolved, layers, opts)
  }

  // Suppress labels for board styles that never show them (matching legacy behaviour)
  if (topo.type === 'grid' && topo.layout === 'intersections') {
    const bs = render.boardStyle
    const cc = render.cellColor
    if (bs === 'xiangqi' || bs === 'shogi' || cc === 'xiangqi' || cc === 'shogi') {
      render.labels = false
    }
  }

  // Build cellMap from zones if needed (non-ops grid path)
  if (topo.type === 'grid' && !render.cellMap && render.zones) {
    render.cellMap = buildCellMap(render.zones, topo.rows || 8, topo.cols || 8)
  } else if (topo.type === 'grid' && !render.cellMap && topo.layout === 'cross') {
    render.cellMap = buildCrossMap(topo.rows || 19, topo.cols || 19, render.castles || [])
  }

  // Hex: derive grid from topology params for terrain games
  if (topo.type === 'hex' && render.cellColor === 'terrain' && resolved.setup && typeof resolved.setup === 'string') {
    const hexPosition = parseHexPositionString(resolved.setup)
    render._hexes = Object.entries(hexPosition).map(([key, val]) => {
      const [q, r] = key.split(',').map(Number)
      const type = typeof val === 'string' ? val : val?.type || null
      return { q, r, type }
    })
    render._hexTypes = true
    render._position = hexPosition
  }

  // Hex: derive grid/params from topology
  if (topo.type === 'hex' && !render._hexes) {
    if (topo.grid) render._hexes = topo.grid.map(c => Array.isArray(c) ? { q: c[0], r: c[1] } : c)
    else if (topo.shape === 'triangular' && topo.sideLength) render._hexes = generateTriangularHexGrid(topo.sideLength)
    else if (topo.shape === 'hexagonal' && topo.radius) render._hexRadius = topo.radius
    else if (topo.rows && topo.cols) { render._hexRows = topo.rows; render._hexCols = topo.cols }
  }

  // Hex: frame/flat/marker apply regardless of how _hexes was derived
  if (topo.type === 'hex') {
    if (topo.orientation === 'flat') render._flat = true
    if (render.frame || topo.shape) render._frame = render.frame || topo.shape
    if (render.centreMarker) render._centreMarker = render.centreMarker
  }

  // Hex position from setup
  if (topo.type === 'hex' && !render._position && resolved.setup) {
    if (typeof resolved.setup === 'object' && !Array.isArray(resolved.setup)) {
      render._position = resolved.setup
    } else if (typeof resolved.setup === 'string' && resolved.setup.includes(',') && resolved.setup.includes(':')) {
      render._position = parseHexPositionString(resolved.setup)
    }
  }

  // Inject piece images for topologies that render pieces internally
  const pieceImages = opts.pieceImages || {}
  if (Object.keys(pieceImages).length > 0) render._pieceImages = pieceImages

  // Parse setup for topologies that render it internally
  if (topo.type === 'pit' && resolved.setup && typeof resolved.setup === 'string') {
    render._parsedSetup = parsePitSetup(resolved.setup)
    render._seedsPerPit = render._parsedSetup.pits[0] || 4
  }
  if (topo.type === 'track' && resolved.setup && typeof resolved.setup === 'string') {
    render._parsedSetup = parseBackgammonSetup(resolved.setup)
  }
  if (topo.type === 'graph' && resolved.setup) {
    if (typeof resolved.setup === 'string' && resolved.setup.includes(':')) {
      render._position = parseGraphSetup(resolved.setup)
    } else if (resolved.setup?.arms) {
      render._filledArms = resolved.setup.arms
    }
  }

  // Track: board data for landlords
  if (topo.type === 'track' && resolved.content?.data) {
    render._boardData = resolved.content.data
    if (resolved.content.board) render._board = resolved.content.board
  }

  // Produce layout
  const result = produceLayout(resolved)
  if (!result) return null

  const renderFn = RENDER_FN[result.type]
  if (!renderFn) return null

  const layout = result.type === 'grid'
    ? renderFn(topo.rows || 8, topo.cols || 8, result.config)
    : renderFn(result.config)
  if (!layout) return null

  // Parse setup → position (grid/graph only; hex/pit/track handle internally)
  const position = parsePosition(resolved, topo)

  // Detect FEN4 for getOwner (4-player piece rotation)
  let getOwner = opts.getOwner || null
  if (!getOwner && typeof resolved.setup === 'string' && resolved.setup.includes(',') && resolved.setup.match(/[yrgb][A-Z]/)) {
    getOwner = fen4GetOwner
  }

  // Piece images (for grid piece rendering in SVG assembly)
  const pieceSurfaceMap = opts.pieceSurfaceMap || {}
  const pieceSurface = opts.pieceSurface || null
  const pieceBorders = resolved.pieces?.borders || null

  // SVG assembly
  const W = layout.width
  const H = layout.height
  const parts = []
  const overflow = render.overflow === 'visible' ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${overflow}>`)

  if (position && Object.keys(position).length > 0) {
    parts.push(collectDefs(position, opts.pieceDefs))
  }

  parts.push(elementsToFragment(layout.elements))

  if (render.overlays && render.overlays.length > 0) {
    const tileSize = render.cellSize || 40
    const ctx = { rows: topo.rows || 8, tileSize, ox: 0, oy: 0 }
    parts.push(renderOverlays(render.overlays, ctx))
  }

  if (topo.type === 'grid' && position && Object.keys(position).length > 0 && layout.cells) {
    const tileSize = render.cellSize || 40
    const colors = surface.colors || {}
    parts.push(`<g pointer-events="none">${renderPiecesFromCells(position, layout.cells, tileSize, { pieceImages, pieceSurfaceMap, pieceSurface, pieceBorders, pieceRotations: resolved.pieceRotations, getOwner, pieceDefs: opts.pieceDefs, colors })}</g>`)
  } else if (position && Object.keys(position).length > 0) {
    parts.push(`<g pointer-events="none"></g>`)
  }

  if (layout.labels && layout.labels.length > 0) {
    parts.push(layout.labels.map(lbl => elementToSvg(lbl)).join(''))
  }

  parts.push('</svg>')
  return parts.join('\n')
}

// --- Position parsing ---

function parsePosition(resolved, topo) {
  const setup = resolved.setup
  if (!setup) return {}
  if (topo.type === 'hex' || topo.type === 'pit' || topo.type === 'track') return {}

  const rows = topo.rows || 8
  const cols = topo.cols || 8
  const vocabulary = resolved.pieces?.vocabulary

  if (Array.isArray(setup)) {
    const first = setup[0]
    if (first && typeof first === 'string' && first.includes('/')) {
      return vocabulary ? parseVocabularyFen(first, rows, cols, vocabulary) : fenToPosition(first, rows, cols)
    }
    return {}
  }

  if (typeof setup === 'string' && setup.includes('/')) {
    if (setup.includes(',') && setup.match(/[yrgb][A-Z]/)) return parseFen4(setup, rows, cols)
    if (setup.includes('[')) return parseSfenToPosition(setup, rows, cols)
    return vocabulary ? parseVocabularyFen(setup, rows, cols, vocabulary) : fenToPosition(setup, rows, cols)
  }

  if (topo.type === 'graph' && typeof setup === 'string' && setup.includes(':')) {
    return parseGraphSetup(setup)
  }

  return {}
}

// --- Piece rendering ---

function renderPiecesFromCells(position, cells, tileSize, opts) {
  const pieceImages = opts.pieceImages || {}
  const cellMap = new Map(cells.map(c => [c.id, c]))
  const parts = []
  for (const [alg, raw] of Object.entries(position)) {
    const cell = cellMap.get(alg)
    if (!cell) continue
    const pos = { x: cell.x, y: cell.y }
    const piece = typeof raw === 'object' ? raw : { type: String(raw) }
    const colorPrefix = piece.color === 'white' ? 'w' : 'b'
    const imageKey = (piece.type === 'stone') ? colorPrefix + 'S'
      : (piece.type === 'man') ? colorPrefix + 'M'
      : (piece.type === 'king') ? colorPrefix + 'K'
      : (piece.type === 'piece') ? colorPrefix + 'P'
      : piece.type

    if (pieceImages[imageKey]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      const surfaceMap = opts.pieceSurfaceMap || {}
      const hasSurface = opts.pieceBorders || surfaceMap[imageKey]
      const rotations = opts.pieceRotations
      const rot = rotations && opts.getOwner ? rotations[opts.getOwner(piece.type)] : 0
      if (hasSurface) {
        const isUpper = piece.type === piece.type.toUpperCase()
        const owner = opts.getOwner ? opts.getOwner(piece.type) : (isUpper ? 'white' : 'black')
        const surface = opts.pieceSurface?.owners?.[owner]
        const ownerColors = surface || { fill: opts.pieceBorders?.[owner] || '#888', stroke: 'rgba(0,0,0,0.3)' }
        parts.push(renderSurfaceSVG('disc', pos.x, pos.y, tileSize, ownerColors, pieceImages[imageKey]))
      } else if (rot) {
        parts.push(`<g transform="rotate(${rot} ${pos.x} ${pos.y})"><image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/></g>`)
      } else {
        parts.push(`<image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
      }
    } else if (piece.type === 'stone') {
      parts.push(drawStone(piece, pos.x, pos.y, tileSize * 0.42, opts.colors || {}))
    } else if (piece.type === 'man' || piece.type === 'king') {
      parts.push(drawDraughtsPiece(piece, pos.x, pos.y, tileSize * 0.38, opts.colors || {}))
    } else if (pieceImages[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<image href="${pieceImages[piece.type]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
    } else if (opts.pieceDefs?.[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<use href="#piece-${piece.type}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}"/>`)
    }
  }
  return parts.join('')
}

function drawStone(piece, cx, cy, r, C) {
  const isW = piece.color === 'white'
  const fill = isW ? (C.whitePieceFill || '#fff') : (C.blackPieceFill || '#1c1c1c')
  const stroke = isW ? (C.whitePieceStroke || '#333') : (C.blackPieceStroke || '#888')
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
}

function drawDraughtsPiece(piece, cx, cy, r, C) {
  const isW = piece.color === 'white'
  const fill = isW ? '#fff' : '#333'
  const stroke = isW ? '#333' : '#111'
  const inner = isW ? '#ccc' : '#555'
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`
  svg += `<circle cx="${cx}" cy="${cy}" r="${r * 0.64}" fill="none" stroke="${inner}" stroke-width="1"/>`
  if (piece.type === 'king') svg += `<circle cx="${cx}" cy="${cy}" r="${r * 0.4}" fill="none" stroke="${inner}" stroke-width="1.5"/>`
  return svg
}

function collectDefs(position, pieceDefs) {
  if (!pieceDefs) return ''
  const needed = new Set()
  for (const raw of Object.values(position)) {
    const t = typeof raw === 'object' ? raw.type : String(raw)
    if (pieceDefs[t]) needed.add(t)
  }
  if (needed.size === 0) return ''
  const parts = ['<defs>']
  for (const t of needed) parts.push(`<symbol id="piece-${t}" viewBox="0 0 45 45">${pieceDefs[t]}</symbol>`)
  parts.push('</defs>')
  return parts.join('')
}

function renderOverlays(overlays, ctx) {
  const { rows, tileSize, ox, oy } = ctx
  const parts = []
  for (const o of overlays) {
    if (!o.path || o.path.length < 2) continue
    const points = o.path.map(alg => {
      const col = alg.charCodeAt(0) - 97
      const row = rows - parseInt(alg.slice(1), 10)
      return [ox + col * tileSize + tileSize / 2, oy + row * tileSize + tileSize / 2]
    })
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
    parts.push(`<path d="${d}" fill="none" stroke="${o.stroke || '#5a9ec8'}" stroke-width="${o.width || 3}" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  return parts.join('')
}

// --- Setup parsers ---

export function fenToPosition(fen, rows, cols) {
  const positionPart = fen.split(' ')[0]
  const ranks = positionPart.split('/')
  const position = {}
  for (let r = 0; r < ranks.length; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length) {
      const ch = rank[i]
      if (ch >= '1' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next); i += 2 }
        else { c += parseInt(ch); i++ }
      } else if (ch === '[') {
        const close = rank.indexOf(']', i)
        if (close === -1) { i++; continue }
        const code = rank.slice(i + 1, close)
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        position[`${file}${rankNum}`] = code
        c++; i = close + 1
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        position[`${file}${rankNum}`] = ch
        c++; i++
      }
    }
  }
  return position
}

function parseVocabularyFen(fen, rows, cols, vocabulary) {
  const position = {}
  const ranks = fen.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length && c < cols) {
      const ch = rank[i]
      if (ch >= '1' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next); i += 2 }
        else { c += parseInt(ch); i++ }
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        const vocabEntry = vocabulary[ch]
        if (vocabEntry) {
          position[`${file}${rankNum}`] = typeof vocabEntry === 'string' ? vocabEntry : { ...vocabEntry }
        } else {
          position[`${file}${rankNum}`] = ch
        }
        c++; i++
      }
    }
  }
  return position
}

function parseFen4(fen4, rows, cols) {
  const position = {}
  const ranks = fen4.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0
    const cells = ranks[r].split(',')
    for (const cell of cells) {
      const trimmed = cell.trim()
      if (/^\d+$/.test(trimmed)) { c += parseInt(trimmed, 10) }
      else { position[`${String.fromCharCode(97 + c)}${rows - r}`] = trimmed; c++ }
    }
  }
  return position
}

const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }
function fen4GetOwner(pieceType) {
  if (pieceType.length >= 2) return FEN4_OWNERS[pieceType[0]] || 'white'
  return pieceType === pieceType.toUpperCase() ? 'white' : 'black'
}

function parseSfenToPosition(fen, rows, cols) {
  const position = {}
  const ranks = fen.split(' ')[0].split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length && c < cols) {
      if (rank[i] === '[') {
        const close = rank.indexOf(']', i)
        if (close === -1) { i++; continue }
        const code = rank.substring(i + 1, close)
        const isGote = code === code.toUpperCase()
        position[`${String.fromCharCode(97 + c)}${rows - r}`] = (isGote ? 'b' : 'w') + code.toUpperCase()
        c++; i = close + 1
      } else if (rank[i] >= '1' && rank[i] <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(rank[i] + next); i += 2 }
        else { c += parseInt(rank[i]); i++ }
      } else if (rank[i] === '+' && i + 1 < rank.length) {
        const ch = rank[i + 1]
        const isGote = ch === ch.toUpperCase()
        position[`${String.fromCharCode(97 + c)}${rows - r}`] = (isGote ? 'b' : 'w') + '+' + ch.toUpperCase()
        c++; i += 2
      } else {
        const ch = rank[i]
        const isGote = ch === ch.toUpperCase()
        position[`${String.fromCharCode(97 + c)}${rows - r}`] = (isGote ? 'b' : 'w') + ch.toUpperCase()
        c++; i++
      }
    }
  }
  return position
}

function parseGraphSetup(setup) {
  const position = {}
  for (const entry of setup.split(',')) {
    const [node, piece] = entry.trim().split(':')
    if (node && piece) position[node] = piece
  }
  return position
}

function parseHexPositionString(setup) {
  const position = {}
  const entries = setup.match(/-?\d+,-?\d+:[A-Za-z+]+/g)
  if (!entries) return position
  for (const entry of entries) {
    const colonIdx = entry.lastIndexOf(':')
    position[entry.substring(0, colonIdx)] = { type: entry.substring(colonIdx + 1) }
  }
  return position
}

function parseBackgammonSetup(notation) {
  const dark = new Array(24).fill(0)
  const light = new Array(24).fill(0)
  if (!notation || notation === 'empty') return { dark, light }
  for (const pair of notation.split(',')) {
    const [posStr, countSymbol] = pair.split(':')
    if (!countSymbol || posStr === 'home' || posStr === 'bar') continue
    const match = countSymbol.match(/^(\d+)([WB])$/)
    if (!match) continue
    if (match[2] === 'W') light[parseInt(posStr, 10)] = parseInt(match[1], 10)
    else dark[parseInt(posStr, 10)] = parseInt(match[1], 10)
  }
  return { dark, light }
}

function parsePitSetup(setup) {
  const pits = [], stores = []
  for (const part of setup.split(';')) {
    if (part.includes(',')) pits.push(...part.split(',').map(Number))
    else stores.push(Number(part))
  }
  return { pits, stores }
}

function generateTriangularHexGrid(sideLength) {
  const hexes = []
  for (let row = 0; row < sideLength; row++) {
    for (let i = 0; i <= row; i++) hexes.push({ q: -row + i, r: row })
  }
  return hexes
}

// --- Zone map builders ---

function buildCellMap(zones, rows, cols) {
  if (!zones) return null
  if (zones.generator === 'cross') return buildCrossMap(rows, cols, zones.castles || [])
  const fill = zones.fill || true
  const map = Array.from({ length: rows }, () => Array(cols).fill(fill))
  if (zones.voids) {
    for (const [r, c] of zones.voids) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = null
    }
  }
  if (zones.cells) {
    for (const def of zones.cells) {
      const positions = Array.isArray(def.at[0]) ? def.at : [def.at]
      for (const [r, c] of positions) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = def.type
      }
    }
  }
  if (zones.map) {
    const lines = zones.map.trim().split('\n')
    for (let r = 0; r < lines.length && r < rows; r++) {
      for (let c = 0; c < lines[r].length && c < cols; c++) {
        if (lines[r][c] !== '.') map[r][c] = lines[r][c]
      }
    }
  }
  return map
}

function buildCrossMap(rows, cols, castles) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  const midR = Math.floor(rows / 2), midC = Math.floor(cols / 2), half = 1
  for (let r = 0; r < midR - half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let r = midR + half + 1; r < rows; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let c = 0; c < midC - half; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let c = midC + half + 1; c < cols; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let r = midR - half; r <= midR + half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'home'
  for (const [r, c] of castles) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'castle'
  }
  return grid
}

// --- Multi-board compositor ---

function renderMultiBoards(resolved, layers, opts) {
  const topo = resolved.topology || {}
  const render = resolved.render || {}
  const surface = resolved.surface || {}
  const { count, layout, labels, fens, colors: layerColors } = layers

  const gap = layout === 'horizontal' ? 20 : 12
  const labelH = 18
  const ts = render.cellSize || 40
  const rows = topo.rows || 8
  const cols = topo.cols || 8
  const innerPad = 24
  const boardW = cols * ts + innerPad * 2
  const boardH = rows * ts + innerPad * 2
  const pad = 4

  let totalW, totalH
  if (layout === 'horizontal') {
    totalW = count * boardW + (count - 1) * gap + pad * 2
    totalH = boardH + pad * 2 + labelH
  } else {
    totalW = boardW + pad * 2
    totalH = count * (boardH + labelH) + (count - 1) * gap + pad * 2
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`)

  for (let i = 0; i < count; i++) {
    let ox, oy
    if (layout === 'horizontal') {
      ox = pad + i * (boardW + gap)
      oy = pad + labelH
    } else {
      ox = pad
      oy = pad + i * (boardH + labelH + gap)
    }

    const labelX = ox + boardW / 2
    const labelY = oy - 4
    parts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="#333" font-family="system-ui">${labels[i] || 'Board ' + (i + 1)}</text>`)

    const lc = layerColors && layerColors[i]
    const boardColors = lc
      ? { ...surface.colors, 'cell-light': lc['cell-light'] || lc.lightSquare || '#f0d9b5', 'cell-dark': lc['cell-dark'] || lc.darkSquare || '#b58863' }
      : surface.colors || {}

    const fen = fens && fens[i]

    let layerOps = render.ops
    if (layerOps && lc) {
      layerOps = layerOps.map(op => {
        if (op.op === 'cells' && op.pattern === 'checkered') {
          return { ...op, light: boardColors['cell-light'], dark: boardColors['cell-dark'] }
        }
        return op
      })
    }

    const layerResolved = {
      topology: { type: 'grid', rows, cols, layout: topo.layout },
      surface: { colors: boardColors },
      render: { cellSize: ts, ops: layerOps, labels: render.labels, inset: render.inset, insetFactor: render.insetFactor, idStyle: render.idStyle },
      setup: fen || null,
      pieces: resolved.pieces,
    }

    const layerSvg = renderFromEngine(layerResolved, opts)
    if (!layerSvg) continue

    const innerStart = layerSvg.indexOf('>') + 1
    const innerEnd = layerSvg.lastIndexOf('</svg>')
    const innerContent = layerSvg.slice(innerStart, innerEnd)

    parts.push(`<g transform="translate(${ox},${oy})" data-layer="${i}">`)
    parts.push(innerContent)
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}
