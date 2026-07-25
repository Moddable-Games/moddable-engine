import { interpolate } from './card-data.js'

export function resolveLink(item, category, manifest, rulesBase = 'https://rules.moddable.games') {
  const linkPath = category.linkPath
  if (!linkPath) {
    if (manifest.rulesUrl) return `${rulesBase}/${manifest.rulesUrl}`
    return null
  }
  const resolved = interpolate(linkPath, item)
  if (!resolved) return null
  return `${rulesBase}/${manifest.rulesUrl}${resolved}`
}
