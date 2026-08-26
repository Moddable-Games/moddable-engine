import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { unsupportedForFamily } from '../src/unsupported.js'

// engine#143. Three rulebooks name 33 variants the engine cannot properly play,
// each with the mechanic it would need. Until this test the information had no
// effect, so a variant could be declared unsupported and marked playable at the
// same time and nothing said so - which is how engine#141 nearly read
// twenty-five broken variants as free wins.

const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || join(process.cwd(), '..', 'moddable-rules', 'games')

function metaOf(path) {
  try { return parseFrontmatter(readFileSync(path, 'utf8')).meta } catch { return null }
}

function families() {
  try {
    return readdirSync(RULES_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .filter(f => existsSync(join(RULES_ROOT, f, 'content', 'variants')))
  } catch { return [] }
}

function declaredUnsupported() {
  const out = []
  for (const family of families()) {
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    const slugs = readdirSync(variantsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
    const variantMetas = {}
    for (const slug of slugs) variantMetas[slug] = metaOf(join(variantsDir, slug + '.md'))
    const rulebook = metaOf(join(RULES_ROOT, family, 'content', 'rulebook.md'))
    for (const [slug, reason] of unsupportedForFamily(rulebook, variantMetas)) {
      out.push({ family, slug, reason, meta: variantMetas[slug], exists: slugs.includes(slug) })
    }
  }
  return out
}

const DECLARED = declaredUnsupported()

// Variants declared unsupported that are nonetheless marked playable. Every one
// is a claim the engine plays a game it has been told it cannot. Shrink-only:
// resolving one removes its entry, and a new contradiction fails outright.
//
// Measured behaviour for each, rather than assumed:
//   cannon-shogi  10 custom piece types declared and on the board, plays
//   chu-shogi     26 declared, 21 on the board; the Lion is a 24-offset leaper,
//                 so its reach is right but its double move is not modelled
//   dobutsu       4 custom types, all present, games terminate
//   sho-shogi     the Crown Prince moves correctly but is not royal, so the
//                 second-royal rule the entry names is genuinely absent
//   tori-shogi    9 declared, 7 on the board, plays
//   yari-shogi    9 declared, 4 non-standard on the board, games terminate
//
// four-player-shogi and hasami-shogi were also on this list and are resolved:
// the first works and its rulebook entry was stale, the second was measured
// capturing 11 times by displacement against 2 custodially and is no longer
// marked playable.
const PLAYABLE_BUT_UNSUPPORTED = [
  'shogi/cannon-shogi',
  'shogi/chu-shogi',
  'shogi/dobutsu',
  'shogi/sho-shogi',
  'shogi/tori-shogi',
  'shogi/yari-shogi',
]

describe('unsupported declarations (engine#143)', () => {
  // A guard that finds no declarations passes. Assert it read the corpus.
  it('reads the declarations the corpus carries', () => {
    expect(DECLARED.length).toBeGreaterThan(25)
  })

  it('never names a variant that does not exist', () => {
    const dangling = DECLARED.filter(d => !d.exists).map(d => `${d.family}/${d.slug}`)
    expect(dangling).toEqual([])
  })

  it('gives every declaration a reason', () => {
    const empty = DECLARED.filter(d => !d.reason || d.reason.length < 10)
      .map(d => `${d.family}/${d.slug}`)
    expect(empty).toEqual([])
  })

  it('introduces no new playable-but-unsupported contradiction', () => {
    const found = DECLARED
      .filter(d => d.meta && d.meta.playable === true)
      .map(d => `${d.family}/${d.slug}`)
      .sort()
    const novel = found.filter(k => !PLAYABLE_BUT_UNSUPPORTED.includes(k))
    expect(novel).toEqual([])
  })

  it('the contradiction list only shrinks', () => {
    const found = DECLARED.filter(d => d.meta && d.meta.playable === true)
    expect(found.length).toBeLessThanOrEqual(PLAYABLE_BUT_UNSUPPORTED.length)
  })
})
