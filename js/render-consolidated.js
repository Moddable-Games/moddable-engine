/**
 * Consolidated rendering — passes layout config through topology packages.
 *
 * This module is a THIN pass-through. It receives layout primitives already
 * declared on the GAMES config (or future frontmatter) and feeds them to
 * topology-grid's renderLayout(). It has ZERO game knowledge.
 *
 * Game-specific data (markers, paths, zones, texts, backgrounds, decorations)
 * lives on the variant config in boards.js — not here.
 */

import { createGridTopology } from '../packages/topology-grid/src/topology-grid.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidated(config) {
  const rows = config.rows || 8
  const cols = config.cols || 8
  const tileSize = config.tileSize || 56
  const colors = config.colors || {}

  const grid = createGridTopology({ rows, cols })

  const layoutConfig = buildLayoutConfig(config, rows, cols, tileSize, colors)
  const layout = grid.renderLayout(layoutConfig)

  // Resolve position to image keys that match pieceImages
  const pieceImages = config.pieceImages || null
  const getOwner = config.getOwner || null
  let resolvedPieces = null
  if (config.position && pieceImages) {
    resolvedPieces = {}
    for (const [sq, raw] of Object.entries(config.position)) {
      const piece = typeof raw === 'object' ? raw : { type: String(raw) }
      let resolved = null
      if (pieceImages[piece.type]) {
        resolved = { type: piece.type }
      } else {
        const key = resolvePieceImageKey(piece)
        if (pieceImages[key]) resolved = { type: key }
      }
      if (resolved) {
        if (getOwner) resolved.owner = getOwner(piece.type)
        resolvedPieces[sq] = resolved
      }
    }
  }

  return serializeLayout(layout, {
    title: config.label,
    pieces: resolvedPieces,
    pieceImages,
    pieceSurface: config.pieceSurface || null,
    pieceSurfaceMap: config.pieceSurfaceMap || {},
    pieceRotations: config.pieceRotations || null,
    tileSize,
  })
}

// TEMPORARY: when frontmatter lands, vocabulary→imageKey mapping moves to game config
// as a declared pieceKeyMap. For now this handles the 3 vocabulary types (stone/man/king).
function resolvePieceImageKey(piece) {
  if (piece.color) {
    const prefix = piece.color === 'white' ? 'w' : 'b'
    if (piece.type === 'stone') return prefix + 'S'
    if (piece.type === 'man') return prefix + 'M'
    if (piece.type === 'king') return prefix + 'K'
    return prefix + piece.type.charAt(0).toUpperCase()
  }
  const ch = piece.type
  if (ch.length === 1) {
    const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase()
    const prefix = isUpper ? 'w' : 'b'
    return prefix + ch.toUpperCase()
  }
  return piece.type
}

/**
 * Build renderLayout config from declared layout primitives on the variant.
 * No game names. No switch statement. Reads what the config declares.
 */
function buildLayoutConfig(config, rows, cols, tileSize, colors) {
  const layout = config.layout || {}
  const positionType = layout.positionType || 'square'
  const isIntersection = positionType === 'intersection'
  const inset = layout.inset ?? (isIntersection ? 20 : 0)
  const showLabels = config.showLabels ?? layout.showLabels ?? true

  // Cell fill: declared strategy or default from positionType
  let cellFill = null
  const cellMap = config.cellMap || null
  if (layout.cellFill === 'checkered' || (!layout.cellFill && positionType === 'square')) {
    const light = colors.lightSquare || '#f0d9b5'
    const dark = colors.darkSquare || '#b58863'
    if (cellMap) {
      cellFill = (r, c) => {
        const cell = cellMap[r]?.[c]
        if (!cell) return null
        if (typeof cell === 'string' && colors[cell]) return colors[cell]
        return (r + c) % 2 === 0 ? light : dark
      }
      cellFill.stroke = (r, c) => {
        const cell = cellMap[r]?.[c]
        if (typeof cell === 'string' && colors[cell + 'Stroke']) return colors[cell + 'Stroke']
        return 'rgba(0,0,0,0.15)'
      }
      cellFill.strokeWidth = () => 1
    } else {
      cellFill = (r, c) => (r + c) % 2 === 0 ? light : dark
    }
  } else if (layout.cellFill === 'none') {
    cellFill = null
  }

  // Cell decorations from declared type→renderer map
  let cellDecorations = null
  let cellAttrs = null
  if (cellMap) {
    cellAttrs = (r, c) => {
      const cell = cellMap[r]?.[c]
      return cell ? { 'data-type': cell } : {}
    }
    const decorations = config.cellTypeDecorations || {}
    if (Object.keys(decorations).length) {
      cellDecorations = (r, c, cx, cy, ts) => {
        const cell = cellMap[r]?.[c]
        const dec = decorations[cell]
        if (!dec) return null
        return dec(cx, cy, ts, colors)
      }
    }
  }

  // Diagonals from declared predicate config
  let diagonals = null
  if (layout.diagonals) {
    const diagConfig = layout.diagonals
    const predicate = typeof diagConfig.predicate === 'function'
      ? diagConfig.predicate
      : diagConfig.predicate === 'alternating'
        ? (r, c) => (r + c) % 2 === 0
        : null
    if (predicate) {
      diagonals = {
        predicate,
        color: diagConfig.color || colors.gridLine || '#333',
        width: diagConfig.width || 1.5,
        forward: diagConfig.forward,
        backward: diagConfig.backward,
      }
    }
  }

  // Overlay paths (river lines on checkered boards like Jungle)
  const paths = [...(layout.paths || [])]
  if (config.overlays) {
    for (const overlay of config.overlays) {
      if (overlay.path) {
        const points = overlay.path.map(sq => {
          const c = sq.charCodeAt(0) - 97
          const r = rows - parseInt(sq.slice(1), 10)
          return { x: c * tileSize + tileSize / 2, y: r * tileSize + tileSize / 2 }
        })
        if (points.length >= 2) {
          const d = 'M ' + points.map(p => `${p.x},${p.y}`).join(' L ')
          paths.push({ d, stroke: overlay.stroke || '#3a6e9e', strokeWidth: overlay.width || 6, fill: 'none', linecap: 'round' })
        }
      }
    }
  }

  const result = {
    tileSize,
    positionType,
    showLabels,
    inset,
    backgrounds: layout.backgrounds || [],
    zones: layout.zones || [],
    cellFill,
    cellDecorations,
    cellAttrs,
    lines: layout.lines || (positionType === 'square' ? { horizontal: false } : { color: colors.gridLine || '#333', width: 1 }),
    diagonals,
    paths,
    markers: layout.markers || [],
    texts: layout.texts || [],
    labels: layout.labels || {},
  }

  return result
}

export function isGridProvider(config) {
  return config.layout != null && !config.layout.hexes && !config.layout.nodes
}
