/**
 * Recolour utilities for SVG piece assets.
 *
 * Given a base SVG string and colour mappings, produces a recoloured version
 * without needing separate asset files per player colour.
 *
 * This operates on SVG markup strings — no DOM required.
 */

export function recolour(svgString, colourMap) {
  let result = svgString
  for (const [from, to] of Object.entries(colourMap)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), to)
  }
  return result
}

export function createRecolourFilter(baseColour, targetColour) {
  return {
    type: 'recolour',
    base: baseColour,
    target: targetColour,
  }
}

export function applyFilters(svgString, filters) {
  let result = svgString
  for (const filter of filters) {
    if (filter.type === 'recolour') {
      result = recolour(result, { [filter.base]: filter.target })
    }
  }
  return result
}
