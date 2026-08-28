import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { unsupportedForFamily } from '../src/unsupported.js'

// engine#109. A variant in the corpus is in one of two states: the engine plays
// it, or the corpus says why it does not. There is no third state.
//
// There used to be. Ninety-eight variants were not playable and fifty-four of
// them said nothing at all, so nothing distinguished "we decided this needs a
// mechanic we have not built" from "nobody has ever looked at it". The count
// could not be read off the corpus - it had to be recomputed by hand every time
// anyone asked how far off the engine was - and engine#141 nearly scored
// twenty-five of the silent ones as free wins.
//
// This test is what stops it coming back. It is a ratchet: the number of silent
// variants may fall and may not rise, so a new variant arrives either playable
// or with its reason written down.
//
// The reason is prose on purpose. "not implemented" is what the playable flag
// already says; what a reader needs is the mechanic that is missing, which is
// also what turns the entry into a scope for the issue that will fix it.

const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || join(process.cwd(), '..', 'moddable-rules', 'games')
const MANIFEST = join(process.cwd(), 'play', 'playability-manifest.json')

// Zero, and it may only stay zero or be lowered. Raising this number is not a
// fix for a failing run: it is a variant that was added without saying whether
// it works, and the entry belongs in its family's rulebook instead.
const MAX_SILENT = 0

function metaOf(path) {
  try { return parseFrontmatter(readFileSync(path, 'utf8')).meta } catch { return null }
}

function silentVariants() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const playable = new Set(manifest.filter(e => e.playable).map(e => `${e.family}/${e.variant}`))

  const out = []
  for (const entry of readdirSync(RULES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const family = entry.name
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    if (!existsSync(variantsDir)) continue

    const slugs = readdirSync(variantsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))

    const variantMetas = {}
    for (const slug of slugs) variantMetas[slug] = metaOf(join(variantsDir, slug + '.md'))
    const declared = unsupportedForFamily(metaOf(join(RULES_ROOT, family, 'content', 'rulebook.md')), variantMetas)

    for (const slug of slugs) {
      if (playable.has(`${family}/${slug}`)) continue
      if (declared.has(slug)) continue
      out.push(`${family}/${slug}`)
    }
  }
  return out.sort()
}

describe('every unplayable variant says why (engine#109)', () => {
  // A guard that reads nothing passes. Assert it found the corpus first.
  it('reads the corpus', () => {
    expect(existsSync(RULES_ROOT)).toBe(true)
    expect(existsSync(MANIFEST)).toBe(true)
  })

  it('leaves no variant unplayable and unexplained', () => {
    expect(silentVariants()).toEqual([])
  })

  it('only ever shrinks', () => {
    expect(silentVariants().length).toBeLessThanOrEqual(MAX_SILENT)
  })
})
