// Board diagram generator — direct port of moddable-chess/js/svg-renderer.js + providers.
// Produces identical output to the published rulebook SVGs.

import { renderSurfaceSVG } from './piece-surface.js'
import { gridStyles } from './grid-board-styles.js'
import { renderGridLayout } from '../../topology-grid/src/topology-grid.js'
import { elementsToFragment } from './serialize-layout.js'
import { produceLayout } from '../../schema/src/produce-layout.js'
import { nyout as nyoutProvider, morris as morrisProvider, asalto as asaltoProvider, sternHalma as sternHalmaProvider } from '../../topology-graph/src/providers.js'
import { hex as hexProvider } from '../../topology-hex/src/providers.js'
import { mancala as mancalaProvider } from '../../topology-pit/src/providers.js'
import { backgammon as backgammonProvider, landlords as landlordsProvider } from '../../topology-track/src/providers.js'

// ─── GRID STYLES — one render pipeline (topology-grid renderGridLayout), ────
// game data declared in grid-board-styles.js configs. No per-style renderers.

const checkered = gridStyles.checkered
const monoGrid = gridStyles['mono-grid']
const go = gridStyles.go
const surakarta = gridStyles.surakarta
const xiangqi = gridStyles.xiangqi
const shogi = gridStyles.shogi
const alquerque = gridStyles.alquerque

// ─── GRAPH PROVIDERS (moved to packages/topology-graph/src/providers.js) ────

const nyout = nyoutProvider
const morris = morrisProvider
const asalto = asaltoProvider
const sternHalma = sternHalmaProvider

// ─── HEX PROVIDER (moved to packages/topology-hex/src/providers.js) ─────────

const hex = hexProvider

// ─── PIT PROVIDER (moved to packages/topology-pit/src/providers.js) ──────────

const mancala = mancalaProvider

// ─── TRACK PROVIDERS (moved to packages/topology-track/src/providers.js) ─────

const backgammon = backgammonProvider
const landlords = landlordsProvider

// ─── PROVIDER REGISTRY ──────────────────────────────────────────────────────

const PROVIDERS = { checkered, 'mono-grid': monoGrid, go, surakarta, xiangqi, shogi, nyout, morris, asalto, alquerque, hex, mancala, backgammon, 'stern-halma': sternHalma, landlords }

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

export function renderBoard(opts) {
  opts = opts || {}
  const boardStyle = opts.boardStyle || 'checkered'
  const provider = PROVIDERS[boardStyle]
  if (!provider) return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Unknown: "${boardStyle}"</text></svg>`

  const rows = opts.rows || 8
  const cols = opts.cols || 8
  const tileSize = opts.tileSize || 56
  const position = opts.position || {}
  const showLabels = opts.showLabels !== false
  const title = opts.title || null

  const providerColors = provider.defaultColors || {}
  const colors = { ...providerColors, ...(opts.colors || {}) }

  const layout = provider.computeLayout({ rows, cols, tileSize, ...opts })
  const boardW = layout.boardW, boardH = layout.boardH
  const labelStyle = provider.labelStyle || 'algebraic'
  const pad = (showLabels && labelStyle !== 'none') ? 24 : 0
  const W = boardW + pad * 2, H = boardH + pad * 2
  const ox = pad, oy = pad

  const parts = []
  const overflow = (opts.variant === '1904-patent' && boardStyle === 'landlords') ? ' style="overflow:visible"' : ''
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${overflow}>`)
  if (title) parts.push(`<title>${esc(title)}</title>`)

  if (position && Object.keys(position).length > 0) {
    parts.push(collectDefs(position, opts.pieceDefs))
  }

  const ctx = { rows, cols, tileSize, ox, oy, colors, opts, boardW, boardH }
  if (opts.ops && gridStyles[boardStyle] && !opts.layers && !opts.cellMap) {
    const engine = {
      topology: { type: 'grid', rows, cols, layout: opts.layout || (provider.positionType === 'intersection' ? 'intersections' : 'cells') },
      surface: { colors },
      render: { cellSize: tileSize, labels: showLabels, inset: opts.inset, insetFactor: opts.insetFactor, idStyle: opts.idStyle || provider.labelStyle, ops: opts.ops },
    }
    const result = produceLayout(engine)
    const layout = renderGridLayout(rows, cols, result.config)
    parts.push(elementsToFragment(layout.elements))
  } else {
    parts.push(provider.render(ctx))
  }

  if (opts.overlays && opts.overlays.length > 0) {
    parts.push(renderOverlays(opts.overlays, ctx))
  }

  if (position && Object.keys(position).length > 0) {
    parts.push(`<g pointer-events="none">${renderPieces(position, provider, ctx, colors)}</g>`)
  }

  if (showLabels && labelStyle !== 'none') {
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
