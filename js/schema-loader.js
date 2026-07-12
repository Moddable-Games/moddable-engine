/**
 * Schema Loader — steps 1-3 of the render pipeline.
 *
 * Builds family/variant index from filesystem (or pre-built index).
 * Parses YAML frontmatter from markdown files.
 * Resolves surface reference into full surface object.
 *
 * In browser context, fetches from a known base URL.
 * Can also accept pre-parsed data (for testing or pre-built indexes).
 */

import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'
import { loadContent } from './content-loader.js'
import { parseFrontmatter as parseProperFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

// --- Loader API ---

export async function loadVariant({ familyPath, variantPath, basePath }) {
  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath).then(r => r.text()),
    fetch(basePath + variantPath).then(r => r.text()),
  ])

  const familyFm = parseProperFrontmatter(familyMd).meta || {}
  const variantFm = parseProperFrontmatter(variantMd).meta || {}

  // Resolve the surface reference
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)

  // Run cascade
  const { resolved, errors } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantFm.slug || '' } },
  })

  if (errors.length > 0) {
    return { resolved, errors }
  }

  // Load content if needed
  const contentBasePath = basePath + variantPath.replace(/\/[^/]+$/, '/')
  const final = await loadContent(resolved, contentBasePath)

  return { resolved: final, errors: [] }
}

export async function loadFromData({ surface, family, variant, basePath }) {
  const surfaceObj = typeof surface === 'string' ? resolveSurface(surface) : (surface || {})
  const { resolved, errors } = cascadeResolve({
    surface: surfaceObj,
    family: family || {},
    variant: variant || {},
  })

  if (errors.length > 0) return { resolved, errors }

  const final = await loadContent(resolved, basePath)
  return { resolved: final, errors: [] }
}

export { parseProperFrontmatter as parseFrontmatter }
