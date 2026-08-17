// Browser consumers: js/play.js, js/game-play.js (via variant-frontmatter.js)
// Node consumers: packages/play/src/play.js (resolveFromDisk)
//
// Single source for resolving variant frontmatter with extends recursion.
// Takes a loader function (sync or async) so the same logic serves both.

import { resolveSurface } from '../../schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../../schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'

function resolveOnce(familyMd, variantMd, label) {
  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: label || variantFm.title || variantFm.slug || '' } },
  })
  return resolved
}

export function resolveVariantSync(family, slug, readFile) {
  let familyMd, variantMd
  try { familyMd = readFile(family, 'rulebook') } catch { return null }
  try { variantMd = readFile(family, slug) } catch { variantMd = '' }
  if (!variantMd && slug && slug !== 'standard') return null

  const resolved = resolveOnce(familyMd, variantMd)

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentResolved = resolveVariantSync(family, pluginBlock.extends, readFile)
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

const FETCH_OPTS = { cache: 'no-cache' }

export async function resolveVariantAsync(family, slug, basePath) {
  const familyPath = basePath + family + '/content/rulebook.md'
  const variantPath = basePath + family + '/content/variants/' + slug + '.md'

  const [familyMd, variantMd] = await Promise.all([
    fetch(familyPath, FETCH_OPTS).then(r => r.text()),
    fetch(variantPath, FETCH_OPTS).then(r => r.ok ? r.text() : ''),
  ])

  const resolved = resolveOnce(familyMd, variantMd)

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentResolved = await resolveVariantAsync(family, pluginBlock.extends, basePath)
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
