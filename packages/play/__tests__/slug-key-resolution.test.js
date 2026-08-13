import '../../plugins/chess/index.js'
import '../test-helpers/setup-rules-reader.js'
import { getVariantConfig, hasVariant, getKeyForSlug } from '../src/variant-registry.js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

function getChessSlugKeyPairs() {
  const dir = join(RULES_ROOT, 'chess', 'content', 'variants')
  const pairs = []
  for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
    const slug = file.replace(/\.md$/, '')
    const content = readFileSync(join(dir, file), 'utf8')
    const keyMatch = content.match(/^key:\s*(.+)$/m)
    if (keyMatch) {
      const key = keyMatch[1].trim()
      if (key !== slug) pairs.push({ slug, key })
    }
  }
  return pairs
}

describe('slug/key resolution — getVariantConfig resolves both identifiers', () => {
  const pairs = getChessSlugKeyPairs()

  it('found chess variants where slug differs from key', () => {
    expect(pairs.length).toBeGreaterThan(25)
  })

  for (const { slug, key } of pairs) {
    it(`${slug} (slug) and ${key} (key) resolve to the same config`, () => {
      const byKey = getVariantConfig('chess', key)
      const bySlug = getVariantConfig('chess', slug)

      if (!byKey) return

      expect(bySlug).not.toBeNull()
      expect(bySlug).toBe(byKey)
    })
  }

  it('hasVariant and getVariantConfig agree for JS-registered variants looked up by slug', () => {
    for (const { slug, key } of pairs) {
      const byKey = getVariantConfig('chess', key)
      if (!byKey) continue
      const has = hasVariant('chess', slug)
      const bySlug = getVariantConfig('chess', slug)
      if (has && bySlug === null) {
        throw new Error(`'${slug}' has JS config under key '${key}' but getVariantConfig('chess', '${slug}') returns null`)
      }
    }
  })

  it('getKeyForSlug returns canonical key for known slugs', () => {
    expect(getKeyForSlug('chess', 'fischer-random')).toBe('chess960')
    expect(getKeyForSlug('chess', 'fog-of-war')).toBe('fogOfWar')
    expect(getKeyForSlug('chess', 'three-check')).toBe('threeCheck')
  })
})
