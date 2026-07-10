/**
 * Consolidated track rendering — passes layout config through topology-track.
 *
 * This module is a THIN pass-through. Zero game knowledge.
 */

import { createTrackTopology } from '../packages/topology-track/src/topology-track.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidatedTrack(config) {
  const layout = config.layout || {}
  const positions = Array.from({ length: layout.totalPoints || 24 }, (_, i) => `point-${i + 1}`)

  const topo = createTrackTopology({ positions, circuit: false })

  const renderConfig = {
    ...layout,
    parsedSetup: config.parsedSetup || null,
    pieceImages: config.pieceImages || null,
    colors: config.colors || {},
  }

  const result = topo.renderLayout(renderConfig)

  return serializeLayout(result, {
    title: config.label,
  })
}

export function isTrackProvider(config) {
  return config.layout != null && config.layout.style === 'points'
}
