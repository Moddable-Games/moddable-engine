// Board diagram generator — renders all board topologies via the ops pipeline.
// Grid styles produce ops from produceLayout(); other topologies use providers.

import { renderSurfaceSVG } from './piece-surface.js'
import { renderGridLayout } from '../../topology-grid/src/topology-grid.js'
import { elementsToFragment, elementToSvg } from './serialize-layout.js'
import { produceLayout } from '../../schema/src/produce-layout.js'
import { graphStyles } from './graph-board-styles.js'
import { hex } from '../../topology-hex/src/providers.js'
import { mancala } from '../../topology-pit/src/providers.js'
import { backgammon, landlords } from '../../topology-track/src/providers.js'

// ─── GRID STYLES (handled entirely by produceLayout + renderGridLayout) ─────

const GRID_STYLES = new Set(['checkered', 'mono-grid', 'go', 'xiangqi', 'shogi', 'surakarta', 'alquerque'])

// ─── GRAPH STYLES (consolidated into graph-board-styles.js) ─────────────────

const nyout = graphStyles.nyout
const morris = graphStyles.morris
const asalto = graphStyles.asalto
const sternHalma = graphStyles['stern-halma']

// ─── NON-GRID PROVIDER REGISTRY ────────────────────────────────────────────

const PROVIDERS = { nyout, morris, asalto, hex, mancala, backgammon, 'stern-halma': sternHalma, landlords }

// ─── RENDERER (ported from moddable-chess/js/svg-renderer.js) ───────────────

function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

function algToRC(alg, rows, skipI) {
  const file = alg.charCodeAt(0) - 97
  const col = (skipI && file > 8) ? file - 1 : file
  return [rows - parseInt(alg.slice(1), 10), col]
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

const GRID_LABEL_STYLE = { checkered: 'algebraic', 'mono-grid': 'algebraic', go: 'go', xiangqi: 'none', shogi: 'none', surakarta: 'algebraic', alquerque: 'algebraic' }
const GRID_POSITION_TYPE = { checkered: 'square', 'mono-grid': 'square', go: 'intersection', xiangqi: 'intersection', shogi: 'intersection', surakarta: 'intersection', alquerque: 'intersection' }
const GRID_DEFAULT_COLORS = {
  checkered: { lightSquare: '#f0d9b5', darkSquare: '#b58863', voidFill: 'transparent' },
  'mono-grid': { monoSquare: '#d9b483', gridLine: '#8b6914' },
  go: { woodLight: '#dcb35c', woodDark: '#d4a843', gridLine: '#3d2b1a', labelText: '#5a4020', starPoint: '#3d2b1a' },
  surakarta: { frame: '#5a3e28', board: '#c8a872', boardInner: '#d4b896', gridLine: '#6b4a30', dotFill: '#4a3320', innerArc: '#6b4a30', outerArc: '#6b4a30' },
  xiangqi: { board: '#f5deb3', gridLine: '#4a3520', river: '#f5deb3', riverText: '#4a3520', palace: '#4a3520', labelText: '#4a3520' },
  shogi: { board: '#e8c97a', boardBorder: '#8b6914', gridLine: '#6b4e1a', hoshi: '#6b4e1a', promotionZone: 'rgba(180, 60, 40, 0.08)', labelText: '#5a4020' },
  alquerque: { monoSquare: '#d9b483', gridLine: '#8b6914' },
}

function mapToSchemaColors(boardStyle, colors) {
  switch (boardStyle) {
    case 'checkered':
      return { 'cell-light': colors.lightSquare, 'cell-dark': colors.darkSquare, stroke: colors.stroke, voidFill: colors.voidFill, ...colors }
    case 'mono-grid':
      return { 'cell-light': colors.monoSquare, stroke: colors.gridLine, ...colors }
    case 'go':
      return { 'cell-light': colors.woodLight, 'cell-dark': colors.woodDark, stroke: colors.gridLine, labelText: colors.labelText, starPoint: colors.starPoint, ...colors }
    case 'xiangqi':
      return { 'cell-light': colors.board, stroke: colors.gridLine, river: colors.river, labelText: colors.labelText, ...colors }
    case 'shogi':
      return { 'cell-light': colors.board, 'cell-dark': colors.boardBorder, stroke: colors.gridLine, hoshi: colors.hoshi, promotion: colors.promotionZone, labelText: colors.labelText, ...colors }
    case 'surakarta':
      return { 'cell-light': colors.board || colors.boardInner, background: colors.frame, stroke: colors.gridLine, innerArc: colors.innerArc, outerArc: colors.outerArc, dotFill: colors.dotFill, ...colors }
    case 'alquerque':
      return { 'cell-light': colors.monoSquare, stroke: colors.gridLine, ...colors }
    default:
      return colors
  }
}

export function renderBoard(opts) {
  opts = opts || {}
  const boardStyle = opts.boardStyle || 'checkered'
  const isGrid = GRID_STYLES.has(boardStyle)
  const provider = isGrid ? null : PROVIDERS[boardStyle]
  if (!isGrid && !provider) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Unknown: "${boardStyle}"</text></svg>`

  const rows = opts.rows || 8
  const cols = opts.cols || 8
  const tileSize = opts.tileSize || 56
  const position = opts.position || {}
  const showLabels = opts.showLabels !== false
  const title = opts.title || null

  const defaultColors = isGrid ? (GRID_DEFAULT_COLORS[boardStyle] || {}) : (provider.defaultColors || {})
  const colors = { ...defaultColors, ...(opts.colors || {}) }

  const labelStyle = isGrid ? GRID_LABEL_STYLE[boardStyle] : (provider.labelStyle || 'algebraic')
  const effectiveLabels = showLabels && labelStyle !== 'none'

  const STYLE_TO_CELLCOLOR = { checkered: 'checkered', 'mono-grid': 'uniform', go: 'uniform', xiangqi: 'xiangqi', shogi: 'uniform', surakarta: 'uniform', alquerque: 'uniform' }

  let gridLayout = null
  if (isGrid) {
    const posType = GRID_POSITION_TYPE[boardStyle]
    const cellColor = STYLE_TO_CELLCOLOR[boardStyle] || 'checkered'
    const surfaceColors = opts.ops ? colors : mapToSchemaColors(boardStyle, colors)
    const engine = {
      topology: { type: 'grid', rows, cols, layout: posType === 'intersection' ? 'intersections' : 'cells' },
      surface: { colors: surfaceColors },
      render: { cellSize: tileSize, cellColor, labels: effectiveLabels, inset: opts.inset, insetFactor: opts.insetFactor, idStyle: opts.idStyle || labelStyle, ops: opts.ops, boardStyle, decorations: opts.decorations, river: opts.river, palace: opts.palace, zones: opts.zones, cellMap: opts.cellMap },
    }
    const result = produceLayout(engine)
    if (result) gridLayout = renderGridLayout(rows, cols, result.config)
  }

  const W = gridLayout ? gridLayout.width : (() => { const l = provider.computeLayout({ rows, cols, tileSize, ...opts }); return l.boardW + (effectiveLabels ? 48 : 0) })()
  const H = gridLayout ? gridLayout.height : (() => { const l = provider.computeLayout({ rows, cols, tileSize, ...opts }); return l.boardH + (effectiveLabels ? 48 : 0) })()

  const layout = gridLayout ? null : provider.computeLayout({ rows, cols, tileSize, ...opts })
  const boardW = gridLayout ? (W - (effectiveLabels ? 48 : 0)) : layout.boardW
  const boardH = gridLayout ? (H - (effectiveLabels ? 48 : 0)) : layout.boardH
  const pad = effectiveLabels ? 24 : 0
  const ox = pad, oy = pad

  const parts = []
  const overflow = (opts.variant === '1904-patent' && boardStyle === 'landlords') ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${overflow}>`)
  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (position && Object.keys(position).length > 0) {
    parts.push(collectDefs(position, opts.pieceDefs))
  }

  const ctx = { rows, cols, tileSize, ox, oy, colors, opts, boardW, boardH }
  if (gridLayout) {
    parts.push(elementsToFragment(gridLayout.elements))
  } else {
    parts.push(provider.render(ctx))
  }

  if (opts.overlays && opts.overlays.length > 0) {
    parts.push(renderOverlays(opts.overlays, ctx))
  }

  if (position && Object.keys(position).length > 0) {
    if (gridLayout) {
      parts.push(`<g pointer-events="none">${renderPiecesFromCells(position, gridLayout.cells, tileSize, opts, colors)}</g>`)
    } else {
      parts.push(`<g pointer-events="none">${renderPieces(position, provider, ctx, colors)}</g>`)
    }
  }

  if (gridLayout) {
    if (gridLayout.labels.length > 0) {
      parts.push(gridLayout.labels.map(lbl => elementToSvg(lbl)).join(''))
    }
  } else if (showLabels && labelStyle !== 'none') {
    parts.push(renderLabels(ctx, colors, provider))
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

function getPixelPos(r, c, provider, ctx) {
  if (provider.getIntersection) return provider.getIntersection(r, c, ctx)
  const { tileSize, ox, oy } = ctx
  return { x: ox + c * tileSize + tileSize / 2, y: oy + r * tileSize + tileSize / 2 }
}

function renderPieces(position, provider, ctx, colors) {
  const { rows, cols, tileSize, opts } = ctx
  const pieceImages = opts.pieceImages || {}
  const skipI = provider.labelStyle === 'go'
  const parts = []
  for (const [alg, raw] of Object.entries(position)) {
    const [r, c] = algToRC(alg, rows, skipI)
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue
    const piece = typeof raw === 'object' ? raw : { type: String(raw) }
    const pos = getPixelPos(r, c, provider, ctx)

    // Build lookup key: for typed pieces (stone/man/king/piece) use color prefix
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

// ─── LABELS ─────────────────────────────────────────────────────────────────

function renderLabels(ctx, colors, provider) {
  const { rows, cols, tileSize, ox, oy, boardH } = ctx
  const labelStyle = provider.labelStyle || 'algebraic'
  const pad = 24, fs = Math.min(13, pad * 0.55)
  const parts = []
  const bottomY = oy + boardH + pad * 0.65

  if (labelStyle === 'go') {
    const GO = 'ABCDEFGHJKLMNOPQRST'
    for (let c = 0; c < cols; c++) {
      const pos = getPixelPos(0, c, provider, ctx)
      parts.push(`<text x="${pos.x}" y="${bottomY}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5a4020')}" font-family="sans-serif">${GO[c]}</text>`)
    }
    for (let r = 0; r < rows; r++) {
      const pos = getPixelPos(r, 0, provider, ctx)
      parts.push(`<text x="${pad * 0.5}" y="${pos.y + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5a4020')}" font-family="sans-serif">${rows - r}</text>`)
    }
  } else {
    for (let c = 0; c < cols; c++) {
      const pos = getPixelPos(0, c, provider, ctx)
      parts.push(`<text x="${pos.x}" y="${bottomY}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5c3a1e')}" font-family="monospace">${String.fromCharCode(97 + c)}</text>`)
    }
    for (let r = 0; r < rows; r++) {
      const pos = getPixelPos(r, 0, provider, ctx)
      parts.push(`<text x="${pad * 0.5}" y="${pos.y + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${esc(colors.labelText || '#5c3a1e')}" font-family="monospace">${rows - r}</text>`)
    }
  }
  return parts.join('')
}
