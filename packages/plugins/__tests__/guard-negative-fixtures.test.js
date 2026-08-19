import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { checkLine, RULES } from '../../../scripts/check-purity.mjs'
import { checkFen4Owners, checkAxialDups } from '../../../scripts/check-duplication.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.resolve(__dirname, '__fixtures__/violations')

describe('guard negative fixtures: every predicate fires on its violation', () => {
  describe('check-purity rules', () => {
    it('game-names fires on game-name-in-core.js', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'game-name-in-core.js'), 'utf8')
      const lines = content.split('\n')
      const hits = lines.filter(l => checkLine(l, 'game-names'))
      expect(hits.length).toBeGreaterThan(0)
    })

    it('variant-slug-branching fires on variant-slug-branch.js', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'variant-slug-branch.js'), 'utf8')
      const lines = content.split('\n')
      const hits = lines.filter(l => checkLine(l, 'variant-slug-branching'))
      expect(hits.length).toBeGreaterThan(0)
    })

    it('piece-name-literals fires on piece-name-switch.js', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'piece-name-switch.js'), 'utf8')
      const lines = content.split('\n')
      const hits = lines.filter(l => checkLine(l, 'piece-name-literals'))
      expect(hits.length).toBeGreaterThan(0)
    })

    it('game-names does NOT fire on import lines', () => {
      const line = "import { createChessPlugin } from './chess-plugin.js'"
      expect(checkLine(line, 'game-names')).toBe(false)
    })
  })

  describe('check-duplication predicates', () => {
    it('checkFen4Owners fires on duplicate-fen4-owners.js', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'duplicate-fen4-owners.js'), 'utf8')
      expect(checkFen4Owners(content, 'packages/fake/dup.js')).toBe(true)
    })

    it('checkFen4Owners does NOT fire on recolour.js', () => {
      const content = "export const FEN4_OWNERS = { r: 'red' }"
      expect(checkFen4Owners(content, 'packages/render/src/recolour.js')).toBe(false)
    })

    it('checkAxialDups does NOT fire on hex-math.js', () => {
      const content = "const x = Math.sqrt(3) * q\nconst y = 3 / 2 * q"
      expect(checkAxialDups(content, 'packages/topologies/hex/src/hex-math.js')).toBe(false)
    })

    it('checkAxialDups fires on content with both halves of axialToPixel', () => {
      const content = "const x = Math.sqrt(3) * q + stuff\nconst y = 3 / 2 * q + more"
      expect(checkAxialDups(content, 'packages/fake/renderer.js')).toBe(true)
    })
  })

  describe('no-deep-imports fixture', () => {
    it('deep-import-crossing.js contains a cross-boundary /src/ import', () => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, 'deep-import-crossing.js'), 'utf8')
      const importMatch = content.match(/from\s+'([^']+)'/)
      expect(importMatch).not.toBeNull()
      expect(importMatch[1]).toContain('/src/')
      const upCount = importMatch[1].split('/').filter(s => s === '..').length
      expect(upCount).toBeGreaterThanOrEqual(3)
    })
  })

  describe('RULES array completeness', () => {
    it('check-purity has at least 6 rules', () => {
      expect(RULES.length).toBeGreaterThanOrEqual(6)
    })

    it('every rule has name, regex, and description', () => {
      for (const rule of RULES) {
        expect(rule.name).toBeDefined()
        expect(rule.regex).toBeInstanceOf(RegExp)
        expect(rule.description).toBeDefined()
      }
    })
  })
})
