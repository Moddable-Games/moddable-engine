// Resolve a variant's frontmatter from moddable-rules into an engine block.
//
// Extracted from js/game-play.js so the create page can load an existing
// variant as a starting template through exactly the same path the play page
// uses. Two copies of the cascade would have drifted, and a template that
// resolves differently from the game it claims to be a copy of is worse than
// no template at all.

import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { RULES_BASE } from './play-shared.js'

// moddable-rules content is fetched with revalidation forced.
//
// Every asset served out of this repo carries a `?v=` string that changes on
// every version bump, so a JS or CSS change reaches the browser. Rules markdown
// carried nothing, and a `?v=` would not have helped anyway, because the engine
// version does not change when a rules file does. The result was that a
// corrected variant could be committed, pulled and served, and the page would
// keep playing the cached copy — which is how four-player-shogi appeared broken
// for hours after it had been fixed.
//
// `no-cache` revalidates rather than refetches: an unchanged file costs a 304.
const RULES_FETCH = { cache: 'no-cache' }

export async function resolveVariantBoard(family, variantConfig, variantKey, slugOverride) {
  const basePath = RULES_BASE + 'games/'
  const cfg = variantConfig || {}
  const variantSlug = slugOverride || cfg.slug || variantKey || 'standard'
  const familyPath = family + '/content/rulebook.md'
  const variantPath = family + '/content/variants/' + variantSlug + '.md'

  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath, RULES_FETCH).then(r => r.text()),
    fetch(basePath + variantPath, RULES_FETCH).then(r => r.ok ? r.text() : '').then(md => {
      if (!md && variantSlug !== 'standard') {
        console.error(`[resolveVariantBoard] No rulebook found for ${family}/${variantSlug} — check that ${variantSlug}.md exists`)
      }
      return md
    }),
  ])

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || cfg.label || '' } },
  })

  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock?.extends) {
    const parentSlug = pluginBlock.extends
    const parentPath = family + '/content/variants/' + parentSlug + '.md'
    const parentMd = await fetch(basePath + parentPath, RULES_FETCH).then(r => r.ok ? r.text() : '')
    if (parentMd) {
      const parentFm = parseFrontmatter(parentMd).meta || {}
      const parentSurface = resolveSurface(parentFm.engine?.surface || familyFm.engine?.surface)
      const { resolved: parentResolved } = cascadeResolve({
        surface: parentSurface,
        family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
        variant: { engine: parentFm.engine || {}, meta: { label: parentFm.title || '' } },
      })
      const parentPlugin = parentResolved.plugins?.[family] || {}
      const merged = { ...parentPlugin, ...pluginBlock }
      delete merged.extends
      resolved.plugins[family] = merged
    }
  }

  resolved._variantMeta = {
    board: variantFm.board || familyFm.board || '',
    win: variantFm.win || familyFm.win || '',
    special: variantFm.special || '',
    title: variantFm.title || '',
  }
  return resolved
}
