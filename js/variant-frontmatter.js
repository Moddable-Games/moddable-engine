// Resolve a variant's frontmatter from moddable-rules into an engine block.
// Thin wrapper over packages/play/src/resolve-frontmatter.js adding _variantMeta.

import { resolveVariantAsync, variantFilePath } from '../packages/play/index.js'
import { parseFrontmatter, effectiveSurface } from '../packages/schema/index.js'
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

export async function resolveVariantBoard(family, variantConfig, variantKey, slugOverride, file) {
  const cfg = variantConfig || {}
  const variantSlug = slugOverride || cfg.slug || variantKey || 'standard'
  const basePath = RULES_BASE + 'games/'

  const resolved = await loadBoardContent(await resolveVariantAsync(family, variantSlug, basePath, file), basePath)

  const variantPath = basePath + variantFilePath(family, variantSlug, file)
  const familyPath = basePath + family + '/content/rulebook.md'
  const [familyMd, variantMd] = await Promise.all([
    fetch(familyPath, RULES_FETCH).then(r => r.text()),
    fetch(variantPath, RULES_FETCH).then(r => r.ok ? r.text() : ''),
  ])
  return annotateVariant(resolved, familyMd, variantMd)
}


// What the pages need from the files beside the resolved engine block. Pure, so
// the create page's template path can be tested without a fetch.
export function annotateVariant(resolved, familyMd, variantMd) {
  const familyFm = parseFrontmatter(familyMd || '').meta || {}
  const variantParsed = variantMd ? parseFrontmatter(variantMd) : { meta: {}, body: '' }
  const variantFm = variantParsed.meta || {}

  resolved._variantMeta = {
    board: variantFm.board || familyFm.board || '',
    win: variantFm.win || familyFm.win || '',
    special: variantFm.special || '',
    title: variantFm.title || '',
  }
  // The rest of the variant's own frontmatter - players, parent, published and
  // the like - for the create page, which carries it through to its export.
  const { engine: _engine, ...fileMeta } = variantFm
  resolved._variantFrontmatter = fileMeta
  resolved._variantBody = variantParsed.body
  // The surface as written. The resolved one is the palette built from it, and
  // written back out it would be a hundred colours where the file had a name.
  // A variant that only overrides colours sits on its family's surface, and a
  // create-page draft has no family underneath it, so the base is named.
  resolved._declaredSurface = effectiveSurface(familyFm.engine?.surface, variantFm.engine?.surface)
  return resolved
}

