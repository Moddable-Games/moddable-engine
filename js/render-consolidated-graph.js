/**
 * Consolidated graph rendering — passes layout config through topology-graph package.
 *
 * This module is a THIN pass-through. It receives layout primitives already
 * declared on the GAMES config (or future frontmatter) and feeds them to
 * topology-graph's renderLayout(). It has ZERO game knowledge.
 */

import { createGraphTopology } from '../packages/topology-graph/src/topology-graph.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidatedGraph(config) {
  const layout = config.layout || {}

  const topo = createGraphTopology({
    nodes: (layout.nodes || []).map(n => n.id),
    edges: (layout.edges || []).map(e => [
      typeof e.from === 'string' ? e.from : (layout.nodes || [])[e.from]?.id,
      typeof e.to === 'string' ? e.to : (layout.nodes || [])[e.to]?.id,
    ]),
  })

  const result = topo.renderLayout(layout)

  const pieceImages = config.pieceImages || null
  const position = config.position || null
  let resolvedPieces = null
  if (position && pieceImages) {
    resolvedPieces = {}
    for (const [sq, raw] of Object.entries(position)) {
      const piece = typeof raw === 'object' ? raw : { type: String(raw) }
      const key = resolveGraphPieceKey(piece, pieceImages)
      if (key) {
        resolvedPieces[sq] = { type: key }
      }
    }
  }

  return serializeLayout(result, {
    title: config.label,
    pieces: resolvedPieces,
    pieceImages,
    pieceSurface: config.pieceSurface || null,
    pieceSurfaceMap: config.pieceSurfaceMap || {},
  })
}

function resolveGraphPieceKey(piece, pieceImages) {
  if (pieceImages[piece.type]) return piece.type
  if (piece.color) {
    const prefix = piece.color === 'white' ? 'w' : 'b'
    const key = prefix + (piece.type === 'man' ? 'M' : piece.type === 'king' ? 'K' : piece.type.charAt(0).toUpperCase())
    if (pieceImages[key]) return key
  }
  const ch = piece.type
  if (ch && ch.length === 1) {
    const isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase()
    const key = (isUpper ? 'w' : 'b') + ch.toUpperCase()
    if (pieceImages[key]) return key
  }
  return null
}

export function isGraphProvider(config) {
  return config.layout != null && config.layout.nodes != null && config.layout.edges != null
}
