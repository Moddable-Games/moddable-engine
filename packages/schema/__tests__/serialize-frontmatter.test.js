import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter, serializeFrontmatter } from '../index.js'

// The writer is the parser's inverse: whatever parseFrontmatter reads,
// serializeFrontmatter writes back to something that reads the same. The create
// page exports through it, so anything it cannot write is something a user's
// variant silently loses (engine#118).

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const roundTrip = (meta) => parseFrontmatter(serializeFrontmatter(meta)).meta

describe('serializeFrontmatter shapes', () => {
  test('a list of maps inside a map inside a list (a xiangqi palace)', () => {
    const meta = { ops: [{ op: 'lines', regions: [{ rows: [0, 2], cols: [3, 5] }, { rows: [7, 9], cols: [3, 5] }] }] }
    expect(roundTrip(meta)).toEqual(meta)
  })

  test('an empty map is written `{}`, not a bare key', () => {
    const meta = { engine: { plugins: { xiangqi: {} }, ops: [] } }
    expect(serializeFrontmatter(meta)).toContain('xiangqi: {}')
    expect(roundTrip(meta)).toEqual(meta)
  })

  test('a quoted list item holding a colon stays a string', () => {
    const meta = { verified: { sources: ['https://example.org/a - the rule, as stated', 'plain'] } }
    expect(roundTrip(meta)).toEqual(meta)
  })

  test('quotes and backslashes inside a string survive', () => {
    const meta = { special: 'Captured pieces become "hostages"', path: 'a\\b' }
    expect(roundTrip(meta)).toEqual(meta)
  })

  test('a first entry that is itself a map or a list', () => {
    const meta = { list: [{ at: { r: 1, c: 2 }, name: 'x' }, { cells: [[0, 1], [2, 3]], fill: '#fff' }] }
    expect(roundTrip(meta)).toEqual(meta)
  })
})

describe('serializeFrontmatter over the rules corpus', () => {
  const files = []
  if (existsSync(RULES_ROOT)) {
    for (const family of readdirSync(RULES_ROOT)) {
      const rulebook = join(RULES_ROOT, family, 'content', 'rulebook.md')
      if (existsSync(rulebook)) files.push(rulebook)
      const dir = join(RULES_ROOT, family, 'content', 'variants')
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) if (f.endsWith('.md')) files.push(join(dir, f))
    }
  }

  test('the corpus is present', () => {
    expect(files.length).toBeGreaterThan(300)
  })

  test('every file reads back identically after writing', () => {
    const differ = []
    for (const file of files) {
      const meta = parseFrontmatter(readFileSync(file, 'utf8')).meta
      if (JSON.stringify(roundTrip(meta)) !== JSON.stringify(meta)) differ.push(file.slice(RULES_ROOT.length + 1))
    }
    expect(differ).toEqual([])
  })
})
