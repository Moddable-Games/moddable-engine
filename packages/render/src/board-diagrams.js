// Board diagram generator — renders all board topologies via the ops pipeline.
// All topologies route through produceLayout() → renderXLayout().

import { renderSurfaceSVG } from './piece-surface.js'
import { renderGridLayout } from '../../topology-grid/src/topology-grid.js'
import { renderGraphLayout } from '../../topology-graph/src/topology-graph.js'
import { renderPitLayout } from '../../topology-pit/src/topology-pit.js'
import { renderTrackLayout } from '../../topology-track/src/topology-track.js'
import { renderHexLayout } from '../../topology-hex/src/topology-hex.js'
import { elementsToFragment, elementToSvg } from './serialize-layout.js'
import { produceLayout } from '../../schema/src/produce-layout.js'

// ─── GRID STYLES (handled entirely by produceLayout + renderGridLayout) ─────

const GRID_STYLES = new Set(['checkered', 'mono-grid', 'go', 'xiangqi', 'shogi', 'surakarta', 'alquerque'])

// ─── GRAPH STYLES (handled entirely by produceLayout + renderGraphLayout) ───

const GRAPH_STYLES = new Set(['morris', 'nyout', 'asalto', 'stern-halma'])
const GRAPH_STRUCTURE = { morris: 'concentric-rings', nyout: 'perimeter-cross', asalto: 'grid-cross', 'stern-halma': 'star' }

// ─── PIT STYLES (handled entirely by produceLayout + renderPitLayout) ───────

const PIT_STYLES = new Set(['mancala'])

// ─── TRACK STYLES (handled entirely by produceLayout + renderTrackLayout) ───

const TRACK_STYLES = new Set(['backgammon', 'landlords'])
const TRACK_STYLE_NAME = { backgammon: 'triangular-points', landlords: 'perimeter' }

// ─── HEX STYLES (handled entirely by produceLayout + renderHexLayout) ───────

const HEX_STYLES = new Set(['hex'])


// ─── RENDERER (ported from moddable-chess/js/svg-renderer.js) ───────────────

function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }


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

const GRID_LABEL_STYLE = { checkered: 'algebraic', 'mono-grid': 'algebraic', go: 'go', xiangqi: 'none', shogi: 'none', surakarta: 'algebraic', alquerque: 'algebraic' }
const GRID_POSITION_TYPE = { checkered: 'square', 'mono-grid': 'square', go: 'intersection', xiangqi: 'intersection', shogi: 'intersection', surakarta: 'intersection', alquerque: 'intersection' }


export function renderBoard(opts) {
  opts = opts || {}
  const boardStyle = opts.boardStyle || 'checkered'
  const isGrid = GRID_STYLES.has(boardStyle)
  const isGraph = GRAPH_STYLES.has(boardStyle)
  const isPit = PIT_STYLES.has(boardStyle)
  const isTrack = TRACK_STYLES.has(boardStyle)
  const isHex = HEX_STYLES.has(boardStyle)
  if (!isGrid && !isGraph && !isPit && !isTrack && !isHex) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Unknown: "${boardStyle}"</text></svg>`

  const rows = opts.rows || 8
  const cols = opts.cols || 8
  const tileSize = opts.tileSize || 56
  const position = opts.position || {}
  const showLabels = opts.showLabels !== false
  const title = opts.title || null

  const colors = { ...(opts.colors || {}) }

  const labelStyle = isGrid ? GRID_LABEL_STYLE[boardStyle] : 'none'
  const effectiveLabels = showLabels && labelStyle !== 'none'

  const STYLE_TO_CELLCOLOR = { checkered: 'checkered', 'mono-grid': 'uniform', go: 'uniform', xiangqi: 'xiangqi', shogi: 'uniform', surakarta: 'uniform', alquerque: 'uniform' }

  let gridLayout = null
  let graphLayout = null
  let pitLayout = null
  let trackLayout = null
  let hexLayout = null
  if (isGrid) {
    const posType = GRID_POSITION_TYPE[boardStyle]
    const cellColor = STYLE_TO_CELLCOLOR[boardStyle] || 'checkered'
    const surfaceColors = colors
    const engine = {
      topology: { type: 'grid', rows, cols, layout: posType === 'intersection' ? 'intersections' : 'cells' },
      surface: { colors: surfaceColors },
      render: { cellSize: tileSize, cellColor, labels: effectiveLabels, inset: opts.inset, insetFactor: opts.insetFactor, idStyle: opts.idStyle || labelStyle, ops: opts.ops, boardStyle, decorations: opts.decorations, river: opts.river, palace: opts.palace, zones: opts.zones, cellMap: opts.cellMap },
    }
    const result = produceLayout(engine)
    if (result) gridLayout = renderGridLayout(rows, cols, result.config)
  } else if (isGraph) {
    const structure = GRAPH_STRUCTURE[boardStyle]
    const graphParams = { rings: opts.rings, midpoints: opts.midpoints, diagonals: opts.diagonals, ...(opts.asaltoGrid || {}) }
    const engine = {
      topology: { type: 'graph', structure, params: graphParams },
      surface: { colors },
      render: { canvasSize: opts.boardSize || 320, nodeRadius: opts.pointRadius || undefined, cellSize: opts.holeSpacing, _position: position, _pieceImages: opts.pieceImages || {}, _filledArms: opts.filledArms || [] },
    }
    const result = produceLayout(engine)
    if (result) graphLayout = renderGraphLayout(result.config)
  } else if (isPit) {
    const engine = {
      topology: { type: 'pit', rows: opts.boardRows || 2, cols: opts.pitsPerSide || 6, stores: opts.hasStores !== false },
      surface: { colors },
      render: {
        cellSize: opts.pitRadius, boardShape: opts.boardShape, cornerRadius: opts.cornerRadius,
        markers: opts.markers, pitCurve: opts.pitCurve,
        storeSize: opts.storeRx !== undefined ? [opts.storeRx, opts.storeRy] : undefined,
        padEdge: opts.padEdge,
        _parsedSetup: opts.parsedSetup, _seedsPerPit: opts.seedsPerPit, _pieceImages: opts.pieceImages,
      },
    }
    const result = produceLayout(engine)
    if (result) pitLayout = renderPitLayout(result.config)
  } else if (isTrack) {
    const engine = {
      topology: { type: 'track', positions: opts.positions || 24 },
      surface: { colors },
      render: {
        trackStyle: TRACK_STYLE_NAME[boardStyle],
        spaceWidth: opts.spaceWidth, cornerSize: opts.cornerSize,
        _parsedSetup: opts.parsedSetup, _pieceImages: opts.pieceImages,
        _boardData: opts.boardData, _board: opts.variant,
      },
    }
    const result = produceLayout(engine)
    if (result) trackLayout = renderTrackLayout(result.config)
  } else if (isHex) {
    const engine = {
      topology: { type: 'hex' },
      surface: { colors },
      render: {
        cellSize: opts.hexSize || opts.tileSize || 30,
        cellColor: opts.hexCellColor,
        _hexes: opts.hexGrid, _hexRadius: opts.hexRadius,
        _hexRows: opts.hexRows, _hexCols: opts.hexCols,
        _flat: opts.flat, _scale: opts.hexScale, _frame: opts.hexFrame,
        _colorFn: opts.hexColorFn, _hexTypes: opts.hexTypes,
        _centreMarker: opts.centreMarker,
        _position: opts.hexPosition, _pieceImages: opts.pieceImages,
      },
    }
    if (engine.render._hexes == null && engine.render._hexRadius == null && !(engine.render._hexRows && engine.render._hexCols)) {
      engine.render._hexRadius = opts.radius || 5
    }
    const result = produceLayout(engine)
    if (result) hexLayout = renderHexLayout(result.config)
  }

  const pipelineLayout = gridLayout || graphLayout || pitLayout || trackLayout || hexLayout
  if (!pipelineLayout) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">No layout for "${boardStyle}"</text></svg>`

  const W = pipelineLayout.width
  const H = pipelineLayout.height
  const pad = effectiveLabels ? 24 : 0
  const ox = pad, oy = pad

  const parts = []
  const overflow = opts.overflow === 'visible' ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${overflow}>`)
  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (position && Object.keys(position).length > 0) {
    parts.push(collectDefs(position, opts.pieceDefs))
  }

  parts.push(elementsToFragment(pipelineLayout.elements))

  if (opts.overlays && opts.overlays.length > 0) {
    const ctx = { rows, cols, tileSize, ox, oy, colors, opts, boardW: W, boardH: H }
    parts.push(renderOverlays(opts.overlays, ctx))
  }

  if (position && Object.keys(position).length > 0) {
    if (gridLayout) {
      parts.push(`<g pointer-events="none">${renderPiecesFromCells(position, gridLayout.cells, tileSize, opts, colors)}</g>`)
    } else {
      parts.push(`<g pointer-events="none"></g>`)
    }
  }

  if (gridLayout && gridLayout.labels.length > 0) {
    parts.push(gridLayout.labels.map(lbl => elementToSvg(lbl)).join(''))
  }

  parts.push('</svg>')
  return parts.join('\n')
}

// ─── FEN PARSER (from moddable-chess generate-svgs.mjs) ─────────────────────

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

// ─── PIECE RENDERING ────────────────────────────────────────────────────────

function renderPiecesFromCells(position, cells, tileSize, opts, colors) {
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
        const surface = opts.pieceSurface && opts.pieceSurface.owners && opts.pieceSurface.owners[owner]
        const ownerColors = surface || { fill: opts.pieceBorders && opts.pieceBorders[owner] || '#888', stroke: 'rgba(0,0,0,0.3)' }
        parts.push(renderSurfaceSVG('disc', pos.x, pos.y, tileSize, ownerColors, pieceImages[imageKey]))
      } else if (rot) {
        parts.push(`<g transform="rotate(${rot} ${pos.x} ${pos.y})"><image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/></g>`)
      } else {
        parts.push(`<image href="${pieceImages[imageKey]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
      }
    } else if (piece.type === 'stone') {
      parts.push(drawStone(piece, pos.x, pos.y, tileSize * 0.42, colors))
    } else if (piece.type === 'man' || piece.type === 'king') {
      parts.push(drawDraughtsPiece(piece, pos.x, pos.y, tileSize * 0.38, colors))
    } else if (pieceImages[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<image href="${pieceImages[piece.type]}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`)
    } else if (opts.pieceDefs && opts.pieceDefs[piece.type]) {
      const x = pos.x - tileSize / 2, y = pos.y - tileSize / 2
      parts.push(`<use href="#piece-${piece.type}" x="${x}" y="${y}" width="${tileSize}" height="${tileSize}"/>`)
    }
  }
  return parts.join('')
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
  for (const t of needed) {
    parts.push(`<symbol id="piece-${t}" viewBox="0 0 45 45">${pieceDefs[t]}</symbol>`)
  }
  parts.push('</defs>')
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

