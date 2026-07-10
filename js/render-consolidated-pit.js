/**
 * Consolidated pit/mancala rendering — passes layout config through topology-pit.
 *
 * This module is a THIN pass-through. Zero game knowledge.
 */

import { createPitTopology } from '../packages/topology-pit/src/topology-pit.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidatedPit(config) {
  const layout = config.layout || {}
  const pitsPerSide = config.pitsPerSide || 6
  const boardRows = config.boardRows || 2
  const hasStores = config.hasStores !== false

  const topo = createPitTopology({ pitsPerSide, players: 2, hasStores })

  const renderConfig = {
    ...layout,
    parsedSetup: config.parsedSetup || null,
    seedsPerPit: config.seedsPerPit || 4,
    colors: config.colors || {},
    pieceImages: config.pieceImages || null,
  }

  const result = topo.renderLayout(renderConfig)

  return serializeLayout(result, {
    title: config.label,
  })
}

export function isPitProvider(config) {
  return config.layout != null && config.layout.pitRadius != null
}
