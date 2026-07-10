/**
 * Consolidated track rendering — passes layout config through topology-track.
 *
 * This module is a THIN pass-through. Zero game knowledge.
 */

import { createTrackTopology } from '../packages/topology-track/src/topology-track.js'
import { serializeLayout } from '../packages/render/src/serialize-layout.js'

export function renderConsolidatedTrack(config) {
  const layout = config.layout || {}
  const style = layout.style || 'points'

  let positions
  if (style === 'perimeter') {
    const total = layout.totalSpaces || 40
    positions = Array.from({ length: total }, (_, i) => `pos-${i + 1}`)
  } else {
    positions = Array.from({ length: layout.totalPoints || 24 }, (_, i) => `point-${i + 1}`)
  }

  const topo = createTrackTopology({ positions, circuit: style === 'perimeter' })

  const renderConfig = {
    ...layout,
    parsedSetup: config.parsedSetup || null,
    pieceImages: config.pieceImages || null,
    colors: layout.colors || config.colors || {},
  }

  const result = topo.renderLayout(renderConfig)

  return serializeLayout(result, {
    title: config.label,
    overflow: layout.overflow || false,
  })
}

export function isTrackProvider(config) {
  return config.layout != null && (config.layout.style === 'points' || config.layout.style === 'perimeter')
}
