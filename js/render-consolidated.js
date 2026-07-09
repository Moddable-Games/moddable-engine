/**
 * Consolidated rendering — routes GAMES config through topology packages.
 *
 * This module translates boards.js config shapes into the primitives-based
 * config that topology-grid.renderLayout() expects, then serializes to SVG.
 *
 * It is the ONLY place where GAMES config knowledge meets topology packages.
 * The topology packages themselves remain game-agnostic.
 */

import { createGridTopology } from '../packages/topology-grid/src/topology-grid.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

const GO_ALPHABET = 'ABCDEFGHJKLMNOPQRST'.split('')

const STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,9],[6,6],[9,3],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
}

export function renderConsolidated(config) {
  const boardStyle = config.boardStyle || 'checkered'
  const rows = config.rows || 8
  const cols = config.cols || 8
  const tileSize = config.tileSize || 56
  const colors = config.colors || {}

  const grid = createGridTopology({ rows, cols })

  const layoutConfig = buildLayoutConfig(boardStyle, rows, cols, tileSize, colors, config)
  if (!layoutConfig) return null

  const layout = grid.renderLayout(layoutConfig)

  // Resolve position to image keys that match pieceImages
  const pieceImages = config.pieceImages || null
  let resolvedPieces = null
  if (config.position && pieceImages) {
    resolvedPieces = {}
    for (const [sq, raw] of Object.entries(config.position)) {
      const piece = typeof raw === 'object' ? raw : { type: String(raw) }
      // Try direct key first (FEN chars are mapped directly in pieceImages)
      if (pieceImages[piece.type]) {
        resolvedPieces[sq] = { type: piece.type }
      } else {
        const key = resolvePieceImageKey(piece)
        if (pieceImages[key]) resolvedPieces[sq] = { type: key }
      }
    }
  }

  return serializeLayout(layout, {
    title: config.label,
    pieces: resolvedPieces,
    pieceImages,
    tileSize,
  })
}

function resolvePieceImageKey(piece) {
  if (piece.color) {
    const prefix = piece.color === 'white' ? 'w' : 'b'
    if (piece.type === 'stone') return prefix + 'S'
    if (piece.type === 'man') return prefix + 'M'
    if (piece.type === 'king') return prefix + 'K'
    return prefix + piece.type.charAt(0).toUpperCase()
  }
  // FEN character: uppercase = white, lowercase = black
  const ch = piece.type
  if (ch.length === 1) {
    const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase()
    const prefix = isUpper ? 'w' : 'b'
    return prefix + ch.toUpperCase()
  }
  return piece.type
}

function buildLayoutConfig(boardStyle, rows, cols, tileSize, colors, config) {
  switch (boardStyle) {
    case 'mono-grid': return buildMonoGrid(rows, cols, tileSize, colors, config)
    case 'checkered': return buildCheckered(rows, cols, tileSize, colors, config)
    case 'go': return buildGo(rows, cols, tileSize, colors, config)
    case 'xiangqi': return buildXiangqi(rows, cols, tileSize, colors, config)
    case 'shogi': return buildShogi(rows, cols, tileSize, colors, config)
    case 'alquerque': return buildAlquerque(rows, cols, tileSize, colors, config)
    case 'surakarta': return buildSurakarta(rows, cols, tileSize, colors, config)
    default: return null
  }
}

function buildMonoGrid(rows, cols, tileSize, colors, config) {
  return {
    tileSize,
    positionType: 'square',
    showLabels: config.showLabels !== false,
    backgrounds: [{ fill: colors.monoSquare || '#d9b483' }],
    lines: { color: colors.gridLine || '#8b6914', width: 1.5 },
  }
}

function buildCheckered(rows, cols, tileSize, colors, config) {
  const cellMap = config.cellMap || null
  let cellFill
  if (cellMap) {
    cellFill = (r, c) => {
      const cell = cellMap[r]?.[c]
      if (!cell) return null
      if (typeof cell === 'string' && colors[cell]) return colors[cell]
      return (r + c) % 2 === 0 ? (colors.lightSquare || '#f0d9b5') : (colors.darkSquare || '#b58863')
    }
    cellFill.stroke = (r, c) => {
      const cell = cellMap[r]?.[c]
      if (typeof cell === 'string' && colors[cell + 'Stroke']) return colors[cell + 'Stroke']
      return 'rgba(0,0,0,0.15)'
    }
    cellFill.strokeWidth = () => 1
  } else {
    const light = colors.lightSquare || '#f0d9b5'
    const dark = colors.darkSquare || '#b58863'
    cellFill = (r, c) => (r + c) % 2 === 0 ? light : dark
  }

  const paths = buildOverlayPaths(config.overlays, rows, cols, tileSize)

  const result = {
    tileSize,
    positionType: 'square',
    showLabels: config.showLabels !== false,
    cellFill,
    lines: { horizontal: false },
    paths,
  }

  if (cellMap) {
    result.cellAttrs = (r, c) => {
      const cell = cellMap[r]?.[c]
      return cell ? { 'data-type': cell } : {}
    }
    result.cellDecorations = (r, c, cx, cy, ts) => {
      const cell = cellMap[r]?.[c]
      if (cell === 'rosette') return crossCirclePattern(cx, cy, ts, colors.rosette || '#8b3a3a', colors.rosetteOuter || '#a04848')
      if (cell === 'castle') return diagonalCross(cx, cy, ts, colors.castleX || '#fff8f0')
      return null
    }
  }

  return result
}

function buildGo(rows, cols, tileSize, colors) {
  const inset = 15
  return {
    tileSize,
    positionType: 'intersection',
    showLabels: true,
    inset,
    backgrounds: [
      { fill: colors.woodLight || '#dcb35c' },
      { x: 24 + inset, y: 24 + inset, width: (cols - 1) * tileSize, height: (rows - 1) * tileSize, fill: colors.woodDark || '#d4a843', rx: 2 },
    ],
    lines: { color: colors.gridLine || '#3d2b1a', width: 0.8 },
    markers: (STAR_POINTS[rows] || []).map(p => ({ r: p[0], c: p[1], fill: colors.starPoint || '#3d2b1a' })),
    labels: { alphabet: GO_ALPHABET, fontFamily: 'sans-serif', color: colors.labelText || '#5a4020' },
  }
}

function buildXiangqi(rows, cols, tileSize, colors, config) {
  const inset = 20
  const river = config.river !== false
  const riverRows = config.riverRows || [Math.floor(rows / 2) - 1, Math.floor(rows / 2)]
  const mid = Math.floor(cols / 2)
  const palaceLeft = config.palaceCols?.[0] ?? (mid - 1)
  const palaceRight = config.palaceCols?.[1] ?? (mid + 1)
  const palaceRows = config.palaceRows || 2

  const backgrounds = [
    { fill: colors.board || '#f5deb3' },
    { fill: 'none', stroke: colors.gridLine || '#4a3520', 'stroke-width': 2 },
  ]

  const diagonals = {
    predicate: (r, c) => {
      const inTopPalace = r >= 0 && r < palaceRows && c >= palaceLeft && c < palaceRight
      const inBotPalace = r >= (rows - 1 - palaceRows) && r < (rows - 1) && c >= palaceLeft && c < palaceRight
      return inTopPalace || inBotPalace
    },
    color: colors.palace || '#4a3520',
    width: 0.8,
  }

  const texts = []
  if (river) {
    const gridW = (cols - 1) * tileSize
    const riverFontSize = Math.min(tileSize * 0.45, 14)
    texts.push(
      { x: 24 + inset + gridW * 0.25, y: 0, text: '楚 河', fontSize: riverFontSize, fontFamily: 'serif', fill: colors.riverText || '#4a3520', _riverMid: true },
      { x: 24 + inset + gridW * 0.75, y: 0, text: '漢 界', fontSize: riverFontSize, fontFamily: 'serif', fill: colors.riverText || '#4a3520', _riverMid: true },
    )
  }

  return {
    tileSize,
    positionType: 'intersection',
    showLabels: false,
    inset,
    backgrounds,
    lines: {
      color: colors.gridLine || '#4a3520',
      width: 1,
      splitAfterRow: river ? riverRows[0] : undefined,
    },
    diagonals,
    texts,
  }
}

function buildShogi(rows, cols, tileSize, colors) {
  const inset = 20
  const zones = []
  if (rows === 9) {
    zones.push(
      { fromRow: 0, toRow: 2, fromCol: 0, toCol: cols - 1, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' },
      { fromRow: 6, toRow: 8, fromCol: 0, toCol: cols - 1, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' },
    )
  }

  const HOSHI_9 = [[2, 2], [2, 6], [6, 2], [6, 6]]
  const markers = (rows === 9 && cols === 9) ? HOSHI_9.map(([r, c]) => ({ r, c, fill: colors.hoshi || '#6b4e1a' })) : []

  return {
    tileSize,
    positionType: 'intersection',
    showLabels: false,
    inset,
    backgrounds: [
      { fill: colors.board || '#e8c97a' },
      { fill: 'none', stroke: colors.boardBorder || '#8b6914', 'stroke-width': 2 },
    ],
    lines: { color: colors.gridLine || '#6b4e1a', width: 0.8 },
    zones,
    markers,
  }
}

function buildAlquerque(rows, cols, tileSize, colors) {
  const inset = Math.round(tileSize * 0.5)
  return {
    tileSize,
    positionType: 'intersection',
    showLabels: true,
    inset,
    backgrounds: [{ fill: colors.monoSquare || '#d9b483', rx: 4 }],
    lines: { color: colors.gridLine || '#8b6914', width: 2 },
    diagonals: {
      predicate: (r, c) => (r + c) % 2 === 0,
      color: colors.gridLine || '#8b6914',
      width: 1.5,
    },
    markers: Array.from({ length: rows * cols }, (_, i) => ({
      r: Math.floor(i / cols), c: i % cols, radius: 3, fill: colors.gridLine || '#8b6914',
    })),
  }
}

function buildSurakarta(rows, cols, tileSize, colors) {
  const arcPad = tileSize * 2.3
  const gridW = (cols - 1) * tileSize
  const gridH = (rows - 1) * tileSize
  const boardW = gridW + arcPad * 2
  const boardH = gridH + arcPad * 2
  const pad = 24
  const gx = pad + arcPad
  const gy = pad + arcPad
  const ix = (i) => gx + i * tileSize
  const iy = (i) => gy + i * tileSize
  const innerR = tileSize
  const outerR = tileSize * 2

  const paths = [
    { d: `M ${ix(1)},${iy(0)} A ${innerR},${innerR} 0 1,0 ${ix(0)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' },
    { d: `M ${ix(cols - 2)},${iy(0)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 1)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' },
    { d: `M ${ix(0)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,0 ${ix(1)},${iy(rows - 1)}`, stroke: colors.innerArc || '#6b4a30' },
    { d: `M ${ix(cols - 1)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 2)},${iy(rows - 1)}`, stroke: colors.innerArc || '#6b4a30' },
    { d: `M ${ix(2)},${iy(0)} A ${outerR},${outerR} 0 1,0 ${ix(0)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' },
    { d: `M ${ix(cols - 3)},${iy(0)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 1)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' },
    { d: `M ${ix(0)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,0 ${ix(2)},${iy(rows - 1)}`, stroke: colors.outerArc || '#6b4a30' },
    { d: `M ${ix(cols - 1)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 3)},${iy(rows - 1)}`, stroke: colors.outerArc || '#6b4a30' },
  ]

  return {
    tileSize,
    positionType: 'intersection',
    showLabels: true,
    inset: arcPad,
    backgrounds: [
      { fill: colors.frame || '#5a3e28', rx: 8 },
      { x: pad + 6, y: pad + 6, width: boardW - 12, height: boardH - 12, fill: colors.board || '#c8a872', rx: 5 },
      { x: pad + 10, y: pad + 10, width: boardW - 20, height: boardH - 20, fill: colors.boardInner || '#d4b896', rx: 3 },
    ],
    lines: { color: colors.gridLine || '#6b4a30', width: 1.5 },
    paths,
    markers: Array.from({ length: rows * cols }, (_, i) => ({
      r: Math.floor(i / cols), c: i % cols, radius: 3.5, fill: colors.dotFill || '#4a3320',
    })),
    labels: { alphabet: GO_ALPHABET, fontFamily: 'sans-serif' },
  }
}

function crossCirclePattern(cx, cy, ts, fill, fillOuter) {
  const s = ts * 0.25
  return [
    { tag: 'circle', attrs: { cx, cy, r: s * 0.42, fill } },
    { tag: 'circle', attrs: { cx, cy: cy - s, r: s * 0.25, fill } },
    { tag: 'circle', attrs: { cx, cy: cy + s, r: s * 0.25, fill } },
    { tag: 'circle', attrs: { cx: cx - s, cy, r: s * 0.25, fill } },
    { tag: 'circle', attrs: { cx: cx + s, cy, r: s * 0.25, fill } },
    { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: fillOuter } },
    { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: fillOuter } },
    { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: fillOuter } },
    { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: fillOuter } },
  ]
}

function diagonalCross(cx, cy, ts, stroke) {
  const d = ts * 0.3
  return [
    { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
    { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
  ]
}

function buildOverlayPaths(overlays, rows, cols, tileSize) {
  if (!overlays || overlays.length === 0) return []
  const pad = 0
  const paths = []
  for (const overlay of overlays) {
    if (overlay.type === 'river' && overlay.path) {
      const points = overlay.path.map(sq => {
        const c = sq.charCodeAt(0) - 97
        const r = rows - parseInt(sq.slice(1), 10)
        return { x: pad + c * tileSize + tileSize / 2, y: pad + r * tileSize + tileSize / 2 }
      })
      if (points.length < 2) continue
      const d = 'M ' + points.map(p => `${p.x},${p.y}`).join(' L ')
      paths.push({ d, stroke: overlay.stroke || '#3a6e9e', strokeWidth: overlay.width || 6, fill: 'none', linecap: 'round' })
    }
  }
  return paths
}

export function isGridProvider(boardStyle) {
  return ['mono-grid', 'checkered', 'go', 'xiangqi', 'shogi', 'alquerque', 'surakarta'].includes(boardStyle)
}
