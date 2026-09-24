import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../../packages/schema/index.js'
import { defaultState, resolveImported, exportText, extendsOf, familyOf, inlineExtends } from '../create-state.js'
import { resolveVariantSync } from '../../packages/play/src/resolve-frontmatter.js'

// engine#118: an export is a whole file - metadata, engine block and page - and
// it has to say whose it is. The rules repo's attribution check fails a file
// that claims nothing verifiable, so a board built here says it is not a
// published rule (`published: false`) and names its author.

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

test('a board built here is its author\'s and claims to be nothing more', () => {
  const state = defaultState('chess')
  state.title = 'Dragon Hunt'
  state.author = 'A. Player'
  const file = parseFrontmatter(exportText(state))
  expect(file.meta.published).toBe(false)
  expect(file.meta.author).toBe('A. Player')
  expect(file.body).toMatch(/### Attribution\s+Created by A\. Player/)
})

test('every variant file in the corpus exports its own metadata and page unchanged', () => {
  const differ = []
  let count = 0
  for (const family of readdirSync(RULES_ROOT)) {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
      const parsed = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      if (!parsed.meta.engine) continue
      count++
      const back = parseFrontmatter(exportText(resolveImported(parsed)))
      const { engine: _a, ...before } = parsed.meta
      const { engine: _b, ...after } = back.meta
      if (JSON.stringify(before) !== JSON.stringify(after) || back.body.trim() !== parsed.body.trim()) differ.push(`${family}/${f}`)
    }
  }
  expect(count).toBeGreaterThan(250)
  expect(differ).toEqual([])
})


// engine#118 Tier E: `extends` is the rules repo's way of sharing a block
// between its files, and a file made here stands alone. Import completes it
// from the parent; the export never names one, and plays the same game.
test('a variant that extends another exports whole, and is the same game', () => {
  const read = (family, slug) => readFileSync(slug === 'rulebook'
    ? join(RULES_ROOT, family, 'content', 'rulebook.md')
    : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`), 'utf8')
  const extending = []
  for (const family of readdirSync(RULES_ROOT)) {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir).filter(n => n.endsWith('.md'))) {
      const parsed = parseFrontmatter(readFileSync(join(dir, f), 'utf8'))
      if (parsed.meta.engine && extendsOf(parsed)) extending.push({ family: familyOf(parsed), slug: f.slice(0, -3), parsed })
    }
  }
  expect(extending.length).toBeGreaterThan(5)
  for (const { family, slug, parsed } of extending) {
    const parent = resolveVariantSync(family, extendsOf(parsed), read)
    const text = exportText(resolveImported(inlineExtends(parsed, parent.plugins?.[family])))
    expect(parseFrontmatter(text).meta.engine.plugins[family].extends).toBeUndefined()
    const replayed = resolveVariantSync(family, slug, (f, s) => (f === family && s === slug ? text : read(f, s)))
    const original = resolveVariantSync(family, slug, read)
    expect(replayed.plugins[family]).toEqual(original.plugins[family])
  }
})
