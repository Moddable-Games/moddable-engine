import '../test-helpers/setup-rules-reader.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { resolveVariantSync } from '../src/resolve-frontmatter.js'
import { STRUCTURAL_KEYS } from '../src/variant-definition.js'

// A rule may sit at the top of the engine block or in the plugin block, and
// the two readers of a resolved block disagree about which wins: `resolveMeta`
// (tests, the API, the puzzle generator) takes the top level, the play page the
// plugin block. Where a variant says both, and says them differently, the same
// variant is two games. Makpong did: its top-level setup was chess's, its
// plugin setup Makruk's, so everything but the play page started it from the
// chess position with Makruk's pieces named on it.

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8'))
const read = (family, slug) => readFileSync(slug === 'rulebook'
  ? join(RULES_ROOT, family, 'content', 'rulebook.md')
  : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`), 'utf8')

test('no playable variant says one thing at the top of its engine block and another in its plugin block', () => {
  const entries = MANIFEST.filter(e => e.playable && existsSync(join(RULES_ROOT, e.family, 'content', 'variants', `${e.slug || e.variant}.md`)))
  expect(entries.length).toBeGreaterThan(200)
  const contradictions = []
  for (const { family, slug, variant } of entries) {
    const resolved = resolveVariantSync(family, slug || variant, read)
    const plugin = resolved.plugins?.[family] || {}
    for (const [key, value] of Object.entries(resolved)) {
      if (STRUCTURAL_KEYS.has(key) || key.startsWith('_') || !(key in plugin)) continue
      if (JSON.stringify(plugin[key]) !== JSON.stringify(value)) contradictions.push(`${family}/${slug || variant}: ${key}`)
    }
  }
  expect(contradictions).toEqual([])
})
