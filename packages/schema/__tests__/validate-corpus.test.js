/**
 * Corpus validation: runs validate.js over every variant file in moddable-rules.
 *
 * This test exists because validate.js was unused for months while the corpus
 * evolved in incompatible directions. When finally run, 43/296 files failed —
 * a validator that rejects valid files is worse than no validator.
 *
 * The fix (documented in validate.js header) made the validator accept both
 * shapes the engine actually loads. This test ensures they stay in sync.
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { validate } from '../src/validate.js'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { schema as gridSchema } from '../../topologies/grid/src/topology-grid.js'
import { schema as hexSchema } from '../../topologies/hex/src/topology-hex.js'
import { schema as trackSchema } from '../../topologies/track/src/topology-track.js'
import { schema as pitSchema } from '../../topologies/pit/src/topology-pit.js'
import { schema as graphSchema } from '../../topologies/graph/src/topology-graph.js'
import { schema as tableauSchema } from '../../topologies/tableau/src/topology-tableau.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const TOPOLOGY_SCHEMAS = [gridSchema, hexSchema, trackSchema, pitSchema, graphSchema, tableauSchema]

function getAllVariantFiles() {
  const files = []
  if (!existsSync(RULES_ROOT)) return files

  for (const family of readdirSync(RULES_ROOT)) {
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    if (existsSync(variantsDir)) {
      for (const file of readdirSync(variantsDir)) {
        if (file.endsWith('.md')) {
          files.push({ family, slug: file.replace('.md', ''), path: join(variantsDir, file) })
        }
      }
    }
    // Also check rulebooks
    const rulebookPath = join(RULES_ROOT, family, 'content', 'rulebook.md')
    if (existsSync(rulebookPath)) {
      files.push({ family, slug: 'rulebook', path: rulebookPath, isRulebook: true })
    }
  }
  return files
}

const allFiles = getAllVariantFiles()

// Shrink-only ratchet: failures must only decrease.
// Current failures are REAL frontmatter issues that need fixing in moddable-rules:
// - 15 files use topology.type: "none" (rulebook-only families)
// - 21 files missing rows/cols for grid topology
// - 6 files missing nodes/edges for graph topology
// - 14 files have other topology config issues (hex, track)
// Fix these in moddable-rules and drop this ceiling accordingly.
const FAILURE_CEILING = 56

describe('validate.js over moddable-rules corpus', () => {
  if (allFiles.length === 0) {
    it.skip('no variant files found (missing moddable-rules checkout)', () => {})
    return
  }

  const failures = []

  it.each(allFiles)('$family/$slug parses and validates', ({ family, slug, path, isRulebook }) => {
    const content = readFileSync(path, 'utf8')
    const { meta } = parseFrontmatter(content)

    // Every file must at least parse
    expect(meta).toBeDefined()
    expect(Object.keys(meta).length).toBeGreaterThan(0)

    const result = validate(meta, TOPOLOGY_SCHEMAS, { isRulebook })
    if (!result.valid) {
      failures.push({ family, slug, errors: result.errors })
    }
    // Individual validation failures are tracked by the ceiling test below,
    // not asserted here. This allows the test suite to run fully and report
    // all failures at once rather than stopping at the first.
  })

  afterAll(() => {
    if (failures.length > 0) {
      console.log(`\nValidation failures (${failures.length}):`)
      for (const f of failures.slice(0, 10)) {
        console.log(`  ${f.family}/${f.slug}: ${JSON.stringify(f.errors || f.error)}`)
      }
      if (failures.length > 10) {
        console.log(`  ... and ${failures.length - 10} more`)
      }
    }
  })

  it('failure count does not exceed ceiling (ratchet)', () => {
    expect(failures.length).toBeLessThanOrEqual(FAILURE_CEILING)
  })
})
