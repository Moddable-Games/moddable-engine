// Six corpus files failed `validate` and nothing ran it, so nothing said so.
// Two were three-player variants writing `players: 3`, a count where the
// schema wants a list of names, which silently produces no player names at
// all. Four were tafl variants declaring `variant_of` where the schema reads
// `parent` - and three of those were not even reported, because
// `looksLikeRulebook` guessed from `slug === title.toLowerCase()` and so
// exempted every variant named after itself from the parent check.
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { validate } from '../src/validate.js'
import { parseFrontmatter } from '../src/parse-frontmatter.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || join(process.cwd(), '..', 'moddable-rules', 'games')

function variantFiles() {
  const out = []
  let families = []
  try { families = readdirSync(RULES_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()) }
  catch { return out }
  for (const family of families) {
    const dir = join(RULES_ROOT, family.name, 'content', 'variants')
    let files = []
    try { files = readdirSync(dir).filter(f => f.endsWith('.md')) } catch { continue }
    for (const file of files) out.push({ family: family.name, file, path: join(dir, file) })
  }
  return out
}

const FILES = variantFiles()

// A validator run over an empty list passes and proves nothing.
const CORPUS_FLOOR = 250

describe('every variant in the corpus validates', () => {
  it('the corpus was found and meets its floor', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(CORPUS_FLOOR)
  })

  it('no variant file fails validation', () => {
    const failures = []
    for (const { family, file, path } of FILES) {
      const { meta } = parseFrontmatter(readFileSync(path, 'utf8'))
      const result = validate(meta, [], { isRulebook: false })
      if (!result.valid) {
        failures.push(`${family}/${file}: ${result.errors.map(e => e.field).join(', ')}`)
      }
    }
    expect(failures).toEqual([])
  })

  // `players` as a count produces no names. The engine needs the list.
  it('every variant declaring engine players declares them as a list', () => {
    const counts = []
    for (const { family, file, path } of FILES) {
      const { meta } = parseFrontmatter(readFileSync(path, 'utf8'))
      const players = meta.engine?.players
      if (players === undefined) continue
      if (!Array.isArray(players)) counts.push(`${family}/${file}: ${JSON.stringify(players)}`)
    }
    expect(counts).toEqual([])
  })
})
