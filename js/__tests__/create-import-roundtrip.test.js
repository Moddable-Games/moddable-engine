import { defaultState, buildResolvedFromState, stateFromResolved, resolveImported } from '../create-state.js'
import { parseFrontmatter } from '../../packages/schema/index.js'
import { FAMILY_RULES, toPluginConfig, defaultRuleValues } from '../create-rules.js'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const RULES_ROOT = join(process.cwd(), '..', 'moddable-rules', 'games')
const PLAYABLE_FAMILIES = ['chess', 'draughts', 'go', 'reversi', 'shogi', 'xiangqi']

// Keys the rules table declares for each family — these MUST round-trip.
const MODELED_KEYS = {}
for (const [family, fields] of Object.entries(FAMILY_RULES)) {
  MODELED_KEYS[family] = new Set(fields.map(f => f.key))
}

function findPlayableVariants() {
  const variants = []
  if (!existsSync(RULES_ROOT)) return variants
  for (const family of readdirSync(RULES_ROOT)) {
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    if (!existsSync(variantsDir)) continue
    for (const file of readdirSync(variantsDir).filter(f => f.endsWith('.md'))) {
      const text = readFileSync(join(variantsDir, file), 'utf8')
      if (!text.includes('playable: true')) continue
      const parsed = parseFrontmatter(text)
      if (!parsed.meta?.engine) continue
      variants.push({ family, file, parsed, text })
    }
  }
  return variants
}

const allVariants = findPlayableVariants()

describe('import YAML round-trip — synthetic', () => {
  test('a chess variant survives export → import → export', () => {
    const yaml = `---
title: Test Chess
slug: test-chess
win: Checkmate the opponent king
special: Pawns can promote on any rank
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
  pieces:
    set: mce-standard
  setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  plugins:
    chess:
      castling: false
      torpedo: true
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.title).toBe('Test Chess')
    expect(state.slug).toBe('test-chess')
    expect(state.win).toBe('Checkmate the opponent king')
    expect(state.special).toBe('Pawns can promote on any rank')
    expect(state.family).toBe('chess')
    expect(state.topology.rows).toBe(8)
    expect(state.topology.cols).toBe(8)
    expect(state.rules.castling).toBe(false)
    expect(state.rules.torpedo).toBe(true)
    expect(Object.keys(state.placement).length).toBeGreaterThan(0)
  })

  test('a board with voids round-trips topology.voids', () => {
    const yaml = `---
title: Balbos Chess
slug: balbos-chess
parent: chess
engine:
  topology:
    type: grid
    rows: 10
    cols: 11
    voids: [[0,0],[0,1],[0,2],[0,3],[0,7],[0,8],[0,9],[0,10],[9,0],[9,1],[9,2],[9,3],[9,7],[9,8],[9,9],[9,10]]
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
    zones:
      voids: [[0,0],[0,1],[0,2],[0,3],[0,7],[0,8],[0,9],[0,10],[9,0],[9,1],[9,2],[9,3],[9,7],[9,8],[9,9],[9,10]]
  setup: "4kbq4/3rnbnr3/2ppppppp2/11/11/11/11/2PPPPPPP2/3RNBNR3/4KBQ4"
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.family).toBe('chess')
    expect(state.topology.rows).toBe(10)
    expect(state.topology.cols).toBe(11)
    expect(state.topology.voids).toBeDefined()
    expect(state.topology.voids.length).toBe(16)

    const resolved = buildResolvedFromState(state)
    expect(resolved.topology.voids).toEqual(state.topology.voids)
  })

  test('state → resolved → state is idempotent for simple chess', () => {
    const state1 = defaultState('chess')
    state1.title = 'Round Trip'
    state1.topology.rows = 8
    state1.topology.cols = 8
    state1.rules.castling = false
    state1.placement = { '0,4': 'K', '7,4': 'k' }

    const resolved1 = buildResolvedFromState(state1)
    const state2 = stateFromResolved(resolved1, 'chess', { title: state1.title })
    const resolved2 = buildResolvedFromState(state2)

    expect(resolved2.topology).toEqual(resolved1.topology)
    expect(resolved2.plugins).toEqual(resolved1.plugins)
    expect(resolved2.setup).toEqual(resolved1.setup)
  })
})

describe('corpus round-trip — all playable variants from moddable-rules', () => {
  if (!allVariants.length) {
    test.skip('moddable-rules not found at expected path', () => {})
    return
  }

  // Collect failures for summary reporting
  const lostStructure = []
  const lostModeledKeys = []
  const lostUnmodeledKeys = []

  for (const { family, file, parsed } of allVariants) {
    const slug = file.replace('.md', '')
    const engine = parsed.meta.engine
    const pluginFamily = Object.keys(engine.plugins || {})[0] || family
    if (!PLAYABLE_FAMILIES.includes(pluginFamily)) continue

    test(`${family}/${slug} structural round-trip`, () => {
      const state = resolveImported(parsed)
      const resolved = buildResolvedFromState(state)
      const failures = []

      // Topology structure must survive
      const origTopo = engine.topology || {}
      if (origTopo.type && resolved.topology.type !== origTopo.type) {
        failures.push(`topology.type: ${origTopo.type} → ${resolved.topology.type}`)
      }
      if (origTopo.rows && resolved.topology.rows !== origTopo.rows) {
        failures.push(`topology.rows: ${origTopo.rows} → ${resolved.topology.rows}`)
      }
      if (origTopo.cols && resolved.topology.cols !== origTopo.cols) {
        failures.push(`topology.cols: ${origTopo.cols} → ${resolved.topology.cols}`)
      }

      // Voids must survive
      if (Array.isArray(origTopo.voids) && origTopo.voids.length) {
        if (!Array.isArray(resolved.topology.voids)) {
          failures.push(`topology.voids lost (${origTopo.voids.length} cells)`)
        } else if (resolved.topology.voids.length !== origTopo.voids.length) {
          failures.push(`topology.voids count: ${origTopo.voids.length} → ${resolved.topology.voids.length}`)
        }
      }

      // Setup must survive (if it's a single-char FEN string the parser handles).
      // Multi-char FEN4 (comma-separated piece codes for 4-player games) is not
      // yet parseable by the create page's setup parser.
      const origSetup = engine.setup
      const isMultiCharFen = typeof origSetup === 'string' && origSetup.includes(',')
      if (typeof origSetup === 'string' && origSetup.includes('/') && !isMultiCharFen) {
        if (!resolved.setup) {
          failures.push(`setup lost`)
        } else if (resolved.setup !== origSetup) {
          failures.push(`setup changed`)
        }
      }

      // Modeled plugin keys must survive (keys in FAMILY_RULES)
      const origPlugin = (engine.plugins || {})[pluginFamily] || {}
      const resolvedPlugin = resolved.plugins?.[pluginFamily] || {}
      const modeled = MODELED_KEYS[pluginFamily] || new Set()

      for (const key of Object.keys(origPlugin)) {
        if (!modeled.has(key)) continue
        if (key === 'vocabulary' || key === 'pieces' || key === 'pieceMoves') continue
        const origVal = origPlugin[key]
        const resolvedVal = resolvedPlugin[key]
        if (resolvedVal === undefined && origVal !== undefined) {
          // Check if it's just because it matches the default
          const defaults = defaultRuleValues(pluginFamily)
          if (JSON.stringify(origVal) === JSON.stringify(defaults[key])) continue
          failures.push(`modeled plugin.${key} lost`)
          lostModeledKeys.push(`${family}/${slug}: ${key}`)
        }
      }

      if (failures.length) {
        lostStructure.push({ variant: `${family}/${slug}`, failures })
      }

      expect(failures).toEqual([])
    })
  }

  // After all tests, log a summary of unmodeled key losses for tracking
  afterAll(() => {
    const unmodeledCounts = {}
    for (const { family, file, parsed } of allVariants) {
      const engine = parsed.meta.engine
      const pluginFamily = Object.keys(engine.plugins || {})[0] || family
      if (!PLAYABLE_FAMILIES.includes(pluginFamily)) continue
      const origPlugin = (engine.plugins || {})[pluginFamily] || {}
      const modeled = MODELED_KEYS[pluginFamily] || new Set()
      for (const key of Object.keys(origPlugin)) {
        if (modeled.has(key)) continue
        if (['vocabulary', 'pieces', 'pieceMoves', 'hooks', 'extends'].includes(key)) continue
        unmodeledCounts[key] = (unmodeledCounts[key] || 0) + 1
      }
    }
    if (Object.keys(unmodeledCounts).length) {
      const sorted = Object.entries(unmodeledCounts).sort((a, b) => b[1] - a[1])
      console.log('\n--- Unmodeled plugin keys (expected losses, not failures) ---')
      for (const [key, count] of sorted) {
        console.log(`  ${key}: ${count} variant${count > 1 ? 's' : ''}`)
      }
    }
    if (lostStructure.length) {
      console.log(`\n--- Structural round-trip failures: ${lostStructure.length} ---`)
      for (const { variant, failures } of lostStructure.slice(0, 10)) {
        console.log(`  ${variant}: ${failures.join(', ')}`)
      }
      if (lostStructure.length > 10) console.log(`  ... and ${lostStructure.length - 10} more`)
    }
  })
})
