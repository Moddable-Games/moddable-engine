// Resolve a variant's frontmatter from moddable-rules into an engine block.
// Thin wrapper over packages/play/src/resolve-frontmatter.js for browser use.

import { resolveFromFetch } from '../packages/play/src/resolve-frontmatter.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { RULES_BASE } from './play-shared.js'

const RULES_FETCH = { cache: 'no-cache' }

export async function resolveVariantBoard(family, variantConfig, variantKey, slugOverride) {
  const cfg = variantConfig || {}
  const variantSlug = slugOverride || cfg.slug || variantKey || 'standard'
  const basePath = RULES_BASE + 'games/'

  const resolved = await resolveFromFetch(family, variantSlug, basePath)

  const variantPath = basePath + family + '/content/variants/' + variantSlug + '.md'
  const familyPath = basePath + family + '/content/rulebook.md'
  const [familyMd, variantMd] = await Promise.all([
    fetch(familyPath, RULES_FETCH).then(r => r.text()),
    fetch(variantPath, RULES_FETCH).then(r => r.ok ? r.text() : ''),
  ])
  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}

  resolved._variantMeta = {
    board: variantFm.board || familyFm.board || '',
    win: variantFm.win || familyFm.win || '',
    special: variantFm.special || '',
    title: variantFm.title || '',
  }
  return resolved
}
