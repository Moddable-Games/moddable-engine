/**
 * Every `pieces.vocabulary` entry must name a piece the declared set can draw.
 *
 * The map is a flat FEN symbol to set key: `b: bS`, `w: wS`. Four variants
 * wrote an object instead - `w: {type: stone, color: white}` - which the
 * renderer cannot resolve, so every piece on those boards fell back to one key
 * and rendered in a single colour. Alquerque, Fanorona and Surakarta all shipped
 * twenty-four black stones on a board that starts twelve against twelve, and
 * nothing said so, because a board full of pieces looks like a board full of
 * pieces.
 *
 * `visual-loop.test.js` did not catch it: it asks whether every piece resolves
 * to artwork, and every piece did - to the same artwork. Resolving is not the
 * same as resolving correctly, so this asks the other question.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { parseFrontmatter } from '../../packages/schema/src/parse-frontmatter.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RULES_ROOT = process.env.MODDABLE_RULES_DIR || resolve(ROOT, '..', 'moddable-rules', 'games')

const gallery = JSON.parse(readFileSync(resolve(ROOT, 'pieces/gallery-index.json'), 'utf8'))
const setsById = new Map(gallery.map(set => [set.id, set]))

function keysOf(setId) {
  const set = setsById.get(setId)
  if (!set) return null
  const keys = new Set(Object.keys(set.pieces || {}))
  for (const base of [set.baseSet, set.extends].filter(Boolean)) {
    const inherited = keysOf(base)
    if (inherited) for (const key of inherited) keys.add(key)
  }
  return keys
}

function metaOf(path) {
  try { return parseFrontmatter(readFileSync(path, 'utf8')).meta } catch { return null }
}

// Every file in the corpus that declares a piece vocabulary, rulebooks included,
// found by shape rather than by name.
function declarations() {
  const out = []
  let families = []
  try {
    families = readdirSync(RULES_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  } catch { return out }

  for (const family of families) {
    const files = [join(RULES_ROOT, family, 'content', 'rulebook.md')]
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    if (existsSync(variantsDir)) {
      for (const file of readdirSync(variantsDir).filter(f => f.endsWith('.md'))) {
        files.push(join(variantsDir, file))
      }
    }
    for (const path of files) {
      if (!existsSync(path)) continue
      const pieces = metaOf(path)?.engine?.pieces
      if (!pieces?.vocabulary || !pieces.set) continue
      const label = path.replace(RULES_ROOT + '/', '').replace('/content/variants/', '/').replace('/content/rulebook.md', '/rulebook')
      out.push({ label, set: pieces.set, vocabulary: pieces.vocabulary })
    }
  }
  return out
}

const DECLARATIONS = declarations()

// Nothing is currently allowed to name a piece its set cannot draw. An entry
// here would be a known gap tracked rather than silently allowed; it may shrink
// and may not grow.
const UNDRAWABLE = []

describe('declared piece vocabularies resolve (engine#161)', () => {
  it('reads the corpus', () => {
    expect(DECLARATIONS.length).toBeGreaterThan(5)
  })

  it('maps every symbol to a set key, not to an object', () => {
    const wrongShape = []
    for (const { label, vocabulary } of DECLARATIONS) {
      for (const [symbol, value] of Object.entries(vocabulary)) {
        if (typeof value !== 'string') wrongShape.push(`${label} ${symbol} -> ${JSON.stringify(value)}`)
      }
    }
    expect(wrongShape).toEqual([])
  })

  it('names only pieces the declared set can draw', () => {
    const missing = []
    for (const { label, set, vocabulary } of DECLARATIONS) {
      const keys = keysOf(set)
      if (!keys) { missing.push(`${label} names unknown set "${set}"`); continue }
      for (const [symbol, value] of Object.entries(vocabulary)) {
        if (typeof value !== 'string') continue
        if (!keys.has(value)) missing.push(`${label} ${symbol} -> ${value} (absent from ${set})`)
      }
    }
    const novel = missing.filter(entry => !UNDRAWABLE.some(known => entry.startsWith(known)))
    expect(novel).toEqual([])
  })

  it('only ever shrinks', () => {
    expect(UNDRAWABLE.length).toBeLessThanOrEqual(0)
  })
})
