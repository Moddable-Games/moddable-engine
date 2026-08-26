// Resolve a variant's frontmatter from moddable-rules into an engine block.
// Thin wrapper over packages/play/src/resolve-frontmatter.js adding _variantMeta.

import { resolveVariantAsync } from '../packages/play/index.js'
import { parseFrontmatter } from '../packages/schema/index.js'
import { RULES_BASE } from './play-shared.js'

const RULES_FETCH = { cache: 'no-cache' }


// A variant whose board is a data file - the landlords track, econopoly -
// names it under `content.source`, and something has to fetch it. The boards
// browser did, in its own copy; the play page did not, so every landlords page
// rendered the words "No board data for 1904-patent" where the board should
// be. One loader now, used by both.
export async function loadBoardContent(resolved, basePath) {
  const content = resolved?.content
  if (!content || !content.source || content.data) return resolved
  const source = content.source
  const url = source.startsWith('http') ? source
    : source.endsWith('.json') && !source.includes('/') ? '../data/' + source
    : (basePath?.endsWith('/') ? basePath : (basePath || '') + '/') + source
  try {
    // RULES_FETCH, like every other rules fetch in this file: board data
    // served from a stale cache is the same bug as stale frontmatter.
    const data = await fetch(url, RULES_FETCH).then(r => (r.ok ? r.json() : null))
    return data ? { ...resolved, content: { ...content, data } } : resolved
  } catch {
    return resolved
  }
}

export async function resolveVariantBoard(family, variantConfig, variantKey, slugOverride) {
  const cfg = variantConfig || {}
  const variantSlug = slugOverride || cfg.slug || variantKey || 'standard'
  const basePath = RULES_BASE + 'games/'

  const resolved = await loadBoardContent(await resolveVariantAsync(family, variantSlug, basePath), basePath)

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
