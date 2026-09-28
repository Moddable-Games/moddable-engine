// Whether the create page can carry a playable variant end to end: load it as
// a template, place its setup on the board, export it, and play what was
// exported as the same game.
//
// The template picker offered every playable variant, and not all of them
// survive the trip: card, tile and dice games have no board to edit, some
// setups can only be carried as text, and some exports lose what play reads.
// Each check here is one of the steps a person takes, and the first that
// fails is the variant's gap.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { stateFromTemplate, buildResolvedFromState, frontmatterFromState, resolveImported } from '../../js/create-state.js'
import { annotateVariant } from '../../js/variant-frontmatter.js'
import { parseFrontmatter, serializeFrontmatter } from '../../packages/schema/index.js'
import { resolveVariantSync } from '../../packages/play/src/resolve-frontmatter.js'
import { createGameForFamily } from '../../packages/play/src/play.js'
import { definitionFromResolved } from '../../packages/play/src/variant-definition.js'

const STRUCTURAL = new Set(['topology', 'players', 'firstPlayer', 'turnOrder', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces'])

// What play consumes from a resolved engine block, as the round-trip test
// compares it.
function consumed(resolved, family) {
  const plugin = { ...(resolved.plugins?.[family] || {}) }
  for (const [key, value] of Object.entries(resolved)) {
    if (!STRUCTURAL.has(key) && !key.startsWith('_') && value !== undefined) plugin[key] = value
  }
  const colors = resolved.surface?.colors || {}
  return JSON.stringify({
    surface: Object.keys(colors).sort().map(k => `${k}=${colors[k]}`),
    topology: resolved.topology, players: resolved.players, firstPlayer: resolved.firstPlayer,
    turnOrder: resolved.turnOrder, render: resolved.render, pieces: resolved.pieces, plugin,
  })
}

export function creatability(rulesRoot, entry) {
  const family = entry.family
  const slug = entry.slug || entry.variant
  if (entry.path) return { creatable: false, gap: 'Played with cards, tiles or dice: the create page edits boards, and this game has none' }
  const file = join(rulesRoot, family, 'content', 'variants', `${slug}.md`)
  if (!existsSync(file)) return { creatable: false, gap: 'No variant file to load as a template' }
  const read = (f, s) => readFileSync(s === 'rulebook'
    ? join(rulesRoot, f, 'content', 'rulebook.md')
    : join(rulesRoot, f, 'content', 'variants', `${s}.md`), 'utf8')
  try {
    const original = resolveVariantSync(family, slug, read)
    const template = stateFromTemplate(annotateVariant(original, read(family, 'rulebook'), read(family, slug)), family, slug)
    if (template.rawSetup !== undefined && template.rawSetup !== '' && template.topology.type !== 'pit') {
      return { creatable: false, gap: 'The setup cannot be placed on the board: the page can only carry it as text' }
    }
    const exported = serializeFrontmatter(frontmatterFromState(template))
    const replayed = resolveVariantSync(family, slug, (f, s) => (f === family && s === slug ? exported : read(f, s)))
    if (consumed(replayed, family) !== consumed(original, family)) {
      return { creatable: false, gap: 'Exporting the template loses something play reads' }
    }
    const reimported = resolveImported(parseFrontmatter(exported))
    const built = buildResolvedFromState(reimported)
    const game = createGameForFamily(family, { definition: definitionFromResolved(family, slug, built, {}), rngSeed: 1 })
    if (!game.getLegalMoves().length) return { creatable: false, gap: 'The exported variant builds but has no moves' }
    return { creatable: true }
  } catch (error) {
    return { creatable: false, gap: `The round trip fails: ${String(error.message).slice(0, 120)}` }
  }
}
