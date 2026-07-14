import { loadVariantFile, loadFamily, loadAllFamilies, scanFrontmatter } from '../src/loader.js'
import { join } from 'node:path'

const RULES_DIR = '/Applications/MAMP/htdocs/MODDABLE/moddable-rules/games'

describe('loader', () => {
  test('loads a single variant file', async () => {
    const path = join(RULES_DIR, 'moddable-chess', 'content', 'variants', 'standard.md')
    const result = await loadVariantFile(path)
    expect(result.meta.title).toBe('Standard Chess')
    expect(result.meta.slug).toBe('standard')
    expect(result.meta.parent).toBe('moddable-chess')
    expect(result.body).toContain('## Standard Chess')
  })

  test('loads a mancala variant', async () => {
    const path = join(RULES_DIR, 'mancala', 'content', 'variants', 'oware.md')
    const result = await loadVariantFile(path)
    expect(result.meta.title).toBe('Oware')
    expect(result.meta.parent).toBe('mancala')
  })

  test('loads a backgammon variant', async () => {
    const path = join(RULES_DIR, 'backgammon', 'content', 'variants', 'standard.md')
    const result = await loadVariantFile(path)
    expect(result.meta.title).toBe('Standard Backgammon')
    expect(result.meta.parent).toBe('backgammon')
  })

  test('loads all variants in a family', async () => {
    const familyDir = join(RULES_DIR, 'mancala')
    const result = await loadFamily(familyDir)
    expect(result.family).toBe('mancala')
    expect(result.variants.length).toBeGreaterThan(0)
    expect(result.hub).not.toBeNull()
    expect(result.hub.meta.title).toContain('Mancala')
  })

  test('loads all families from games directory', async () => {
    const families = await loadAllFamilies(RULES_DIR)
    expect(families.length).toBeGreaterThanOrEqual(41)
    const chess = families.find(f => f.family === 'moddable-chess')
    expect(chess).toBeDefined()
    expect(chess.variants.length).toBeGreaterThan(30)
  })

  test('scans all frontmatter fields across all variants', async () => {
    const report = await scanFrontmatter(RULES_DIR)
    expect(report.familyCount).toBeGreaterThanOrEqual(41)
    expect(report.variantCount).toBeGreaterThanOrEqual(150)
    expect(report.fields.title).toBeDefined()
    expect(report.fields.title.count).toBe(report.variantCount)
    expect(report.fields.slug).toBeDefined()
    expect(report.fields.parent).toBeDefined()
  })
})
