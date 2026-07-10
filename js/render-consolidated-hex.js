/**
 * Consolidated hex rendering — passes layout config through topology-hex package.
 *
 * This module is a THIN pass-through. It receives layout primitives already
 * declared on the GAMES config (or future frontmatter) and feeds them to
 * topology-hex's renderLayout(). It has ZERO game knowledge.
 *
 * Game-specific data (colour functions, positions, frame specs, generators)
 * lives on the variant config in boards.js — not here.
 */

import { createHexTopology } from '../packages/topology-hex/src/topology-hex.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidatedHex(config) {
  const layout = config.layout || {}
  const hexes = layout.hexes || []
  const orientation = layout.orientation || 'pointy'
  const cellSize = layout.cellSize || config.hexSize || 30

  const topo = createHexTopology({
    radius: hexes.length > 0 ? 0 : 5,
    orientation,
  })

  const renderConfig = {
    hexes,
    orientation,
    cellSize,
    scale: layout.scale || 0.95,
    background: layout.background || null,
    frame: layout.frame || null,
    cellFill: layout.cellFill || (() => '#ccc'),
    cellStroke: layout.cellStroke || { color: 'rgba(0,0,0,0.2)', width: 1 },
    cellImage: layout.cellImage || null,
    cellLabel: layout.cellLabel || null,
    labelStyle: layout.labelStyle || {},
    overlays: layout.overlays || [],
    centreMarker: layout.centreMarker || null,
  }

  const result = topo.renderLayout(renderConfig)

  const pieceImages = config.pieceImages || null
  const getOwner = config.getOwner || null
  const position = config.position || config.hexPosition || null
  let resolvedPieces = null
  if (position && pieceImages) {
    resolvedPieces = {}
    for (const [sq, raw] of Object.entries(position)) {
      const piece = typeof raw === 'object' ? raw : { type: String(raw) }
      const key = resolveHexPieceKey(piece.type, pieceImages)
      if (key) {
        const resolved = { type: key }
        if (getOwner) resolved.owner = getOwner(piece.type)
        resolvedPieces[sq] = resolved
      }
    }
  }

  return serializeLayout(result, {
    title: config.label,
    pieces: resolvedPieces,
    pieceImages,
    pieceSurface: config.pieceSurface || null,
    pieceSurfaceMap: config.pieceSurfaceMap || {},
    pieceRotations: config.pieceRotations || null,
    tileSize: cellSize * 1.6,
  })
}

function resolveHexPieceKey(type, pieceImages) {
  if (pieceImages[type]) return type
  if (type.length === 1) {
    const isUpper = type === type.toUpperCase() && type !== type.toLowerCase()
    const key = (isUpper ? 'w' : 'b') + type.toUpperCase()
    if (pieceImages[key]) return key
  }
  return null
}

export function isHexProvider(config) {
  return config.layout != null && config.layout.hexes != null
}
