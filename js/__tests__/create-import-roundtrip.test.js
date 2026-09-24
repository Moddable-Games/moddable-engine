import { defaultState, buildResolvedFromState, stateFromResolved, resolveImported, stateFromTemplate, frontmatterFromState } from '../create-state.js'
import { parseFrontmatter, serializeFrontmatter } from '../../packages/schema/index.js'
import { resolveVariantSync } from '../../packages/play/src/resolve-frontmatter.js'
import { annotateVariant } from '../variant-frontmatter.js'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

// Read from the manifest, not restated. As a literal this named six families
// and silently skipped every variant of the four that came after it, so the
// round-trip it exists to prove was never run on hex, mancala, morris or
// landlords-game.
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8'))


describe('import YAML round-trip — synthetic', () => {
  test('a chess variant survives export → import → export', () => {
    const yaml = `---
title: Test Chess
slug: test-chess
win: Checkmate the opponent king
special: Pawns can promote on any rank
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
  pieces:
    set: mce-standard
  setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  plugins:
    chess:
      castling: false
      torpedo: true
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.title).toBe('Test Chess')
    expect(state.slug).toBe('test-chess')
    expect(state.win).toBe('Checkmate the opponent king')
    expect(state.special).toBe('Pawns can promote on any rank')
    expect(state.family).toBe('chess')
    expect(state.topology.rows).toBe(8)
    expect(state.topology.cols).toBe(8)
    expect(state.rules.castling).toBe(false)
    expect(state.rules.torpedo).toBe(true)
    expect(Object.keys(state.placement).length).toBeGreaterThan(0)
  })

  test('a board with voids round-trips topology.voids', () => {
    const yaml = `---
title: Balbos Chess
slug: balbos-chess
parent: chess
engine:
  topology:
    type: grid
    rows: 10
    cols: 11
    voids: [[0,0],[0,1],[0,2],[0,3],[0,7],[0,8],[0,9],[0,10],[9,0],[9,1],[9,2],[9,3],[9,7],[9,8],[9,9],[9,10]]
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
    zones:
      voids: [[0,0],[0,1],[0,2],[0,3],[0,7],[0,8],[0,9],[0,10],[9,0],[9,1],[9,2],[9,3],[9,7],[9,8],[9,9],[9,10]]
  setup: "4kbq4/3rnbnr3/2ppppppp2/11/11/11/11/2PPPPPPP2/3RNBNR3/4KBQ4"
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.family).toBe('chess')
    expect(state.topology.rows).toBe(10)
    expect(state.topology.cols).toBe(11)
    expect(state.topology.voids).toBeDefined()
    expect(state.topology.voids.length).toBe(16)

    const resolved = buildResolvedFromState(state)
    expect(resolved.topology.voids).toEqual(state.topology.voids)
  })

  test('state → resolved → state is idempotent for simple chess', () => {
    const state1 = defaultState('chess')
    state1.title = 'Round Trip'
    state1.topology.rows = 8
    state1.topology.cols = 8
    state1.rules.castling = false
    state1.placement = { '0,4': 'K', '7,4': 'k' }

    const resolved1 = buildResolvedFromState(state1)
    const state2 = stateFromResolved(resolved1, 'chess', { title: state1.title })
    const resolved2 = buildResolvedFromState(state2)

    expect(resolved2.topology).toEqual(resolved1.topology)
    expect(resolved2.plugins).toEqual(resolved1.plugins)
    expect(resolved2.setup).toEqual(resolved1.setup)
  })
})

// engine#118: "anything playable should be buildable". The measure is the one
// the issue names: a variant loaded into the create page and exported again
// must be the same game. Not "the topology survived" - the engine block play
// consumes, compared whole, from the original file and from the exported one.
//
// Three paths, because each once lost something the others kept:
//   import    a file read from disk (the Import button)
//   template  a variant resolved against its family (the template picker, and
//             "Edit in Create" from the play page)
//   draft     that template played without being exported ("Try in Play")
//
// and two more that prove the page can *build* each variant, not only carry it:
// the same states with the carried source removed, so that everything the file
// says has to come from the page's own controls and its other settings.
//
// This replaced a structural check that passed while 195 of 239 variants lost
// something on export: turn orders, pawn configurations, layered boards, and
// family defaults the form disagreed with.
describe('corpus round-trip: an exported variant is the same game', () => {
  // The create page edits boards. A game played with cards, tiles or dice
  // lives under content/games and has no board to export (#176).
  const MANIFEST_PLAYABLE = MANIFEST.filter(e => e.playable && !e.path)
  const read = (family, slug) => readFileSync(slug === 'rulebook'
    ? join(RULES_ROOT, family, 'content', 'rulebook.md')
    : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`), 'utf8')

  const STRUCTURAL = new Set(['topology', 'players', 'firstPlayer', 'turnOrder', 'meta', 'surface', 'render', 'components', 'plugins', 'pieces'])
  // What play consumes: the plugin block with the engine's top-level rule keys
  // folded in over it (`resolveMeta`), and the rest of the block beside it.
  function consumed(resolved, family) {
    const plugin = { ...(resolved.plugins?.[family] || {}) }
    for (const [key, value] of Object.entries(resolved)) {
      if (!STRUCTURAL.has(key) && !key.startsWith('_') && value !== undefined) plugin[key] = value
    }
    const colors = resolved.surface?.colors || {}
    return JSON.parse(JSON.stringify({
      surface: Object.keys(colors).sort().map(k => `${k}=${colors[k]}`),
      topology: resolved.topology,
      players: resolved.players,
      firstPlayer: resolved.firstPlayer,
      turnOrder: resolved.turnOrder,
      render: resolved.render,
      pieces: resolved.pieces,
      plugin,
    }))
  }

  const entries = MANIFEST_PLAYABLE.filter(e => existsSync(join(RULES_ROOT, e.family, 'content', 'variants', `${e.slug || e.variant}.md`)))

  test('every playable variant is in the corpus', () => {
    expect(entries.length).toBe(MANIFEST_PLAYABLE.length)
  })

  for (const entry of entries) {
    const family = entry.family
    const slug = entry.slug || entry.variant
    test(`${family}/${slug}`, () => {
      const original = consumed(resolveVariantSync(family, slug, read), family)
      const replayed = (text) => consumed(resolveVariantSync(family, slug, (f, s) => (f === family && s === slug ? text : read(f, s))), family)
      const template = () => stateFromTemplate(annotateVariant(resolveVariantSync(family, slug, read), read(family, 'rulebook'), read(family, slug)), family, slug)

      const imported = resolveImported(parseFrontmatter(read(family, slug)))
      expect(replayed(serializeFrontmatter(frontmatterFromState(imported)))).toEqual(original)
      expect(replayed(serializeFrontmatter(frontmatterFromState(template())))).toEqual(original)
      expect(consumed(buildResolvedFromState(template()), family)).toEqual(original)

      const built = (state) => { state.source = null; return state }
      expect(replayed(serializeFrontmatter(frontmatterFromState(built(resolveImported(parseFrontmatter(read(family, slug)))))))).toEqual(original)
      expect(consumed(buildResolvedFromState(built(template())), family)).toEqual(original)
    })
  }
})

// Carrying a setup is not the same as being able to place on it. A variant
// whose setup the page can only carry as text loads and exports correctly and
// still cannot be edited on the board. Only seed counts are text by design.
describe('every playable variant can be placed on', () => {
  const read = (family, slug) => readFileSync(slug === 'rulebook'
    ? join(RULES_ROOT, family, 'content', 'rulebook.md')
    : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`), 'utf8')

  test('the setup reads onto the board, except seed counts', () => {
    const textOnly = []
    for (const { family, slug, variant } of MANIFEST.filter(e => e.playable)) {
      const name = slug || variant
      if (!existsSync(join(RULES_ROOT, family, 'content', 'variants', `${name}.md`))) continue
      const state = stateFromTemplate(annotateVariant(resolveVariantSync(family, name, read), read(family, 'rulebook'), read(family, name)), family, name)
      if (state.rawSetup !== undefined && state.rawSetup !== '' && state.topology.type !== 'pit') textOnly.push(`${family}/${name}`)
    }
    expect(textOnly).toEqual([])
  })
})
