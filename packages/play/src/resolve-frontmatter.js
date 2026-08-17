// Browser consumers: js/play.js, js/game-play.js (via variant-frontmatter.js)
// Single source for resolving variant frontmatter via fetch.
// Mirrors resolveFromDisk in play.js but async, fetch-backed, browser-safe.

import { resolveSurface } from '../../schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../../schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'

const FETCH_OPTS = { cache: 'no-cache' }

export async function resolveFromFetch(family, variantSlug, basePath) {
  const familyPath = basePath + family + '/content/rulebook.md'
  const variantPath = basePath + family + '/content/variants/' + variantSlug + '.md'

  const [familyMd, variantMd] = await Promise.all([
    fetch(familyPath, FETCH_OPTS).then(r => r.text()),
    fetch(variantPath, FETCH_OPTS).then(r => r.ok ? r.text() : ''),
  ])

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantFm.slug || '' } },
  })

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentResolved = await resolveFromFetch(family, pluginBlock.extends, basePath)
    if (parentResolved) {
      const parentPlugin = parentResolved.plugins?.[family] || {}
      const merged = { ...parentPlugin, ...pluginBlock }
      delete merged.extends
      if (!resolved.plugins) resolved.plugins = {}
      resolved.plugins[family] = merged
    }
  }

  return resolved
}
