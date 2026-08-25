/**
 * Config access validation for all 6 plugin families.
 *
 * Ensures every config key accessed by a plugin is either:
 * 1. In the plugin's ACCEPTED_KEYS (plugin-specific config)
 * 2. In PLAY_LAYER_KEYS (stripped before reaching the plugin)
 *
 * This catches misspelled keys (flyingkings vs flyingKings) and
 * undocumented keys that silently do nothing.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

// Import all plugins to ensure they're registered
import { createChessPlugin } from '../chess/index.js'
import { createGoPlugin } from '../go/index.js'
import { createDraughtsPlugin } from '../draughts/index.js'
import { createReversiPlugin } from '../reversi/index.js'
import { createShogiPlugin } from '../shogi/index.js'
import { createXiangqiPlugin } from '../xiangqi/index.js'

import { getVariantConfig, getVariantKeys } from '../../play/src/variant-registry.js'
import { resolveFromDisk, setRulesReader, STRUCTURAL_KEYS } from '../../play/src/play.js'
import { unknownConfigKeys } from '../../core/index.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
setRulesReader(
  (family, slug) => {
    const path = slug === 'rulebook'
      ? join(RULES_ROOT, family, 'content', 'rulebook.md')
      : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`)
    return readFileSync(path, 'utf8')
  },
  (family) => {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    try { return readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, '')) }
    catch { return [] }
  }
)

// Keys consumed by the play layer (stripped before reaching plugins)
const PLAY_LAYER_KEYS = new Set([
  'key', 'slug', 'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology',
  'rows', 'cols', 'size', 'players', 'search',
])

// Derived from each plugin's own exported CONFIG_KEYS rather than restated
// here. The previous copy in this file had drifted from all six plugins, which
// is how a duplicated allowlist always ends up.
const FAMILY_ACCEPTED_KEYS = {
  chess: createChessPlugin.configKeys,
  go: createGoPlugin.configKeys,
  draughts: createDraughtsPlugin.configKeys,
  reversi: createReversiPlugin.configKeys,
  shogi: createShogiPlugin.configKeys,
  xiangqi: createXiangqiPlugin.configKeys,
}

const FAMILIES = Object.keys(FAMILY_ACCEPTED_KEYS)

for (const family of FAMILIES) {
  describe(`config-access validation: ${family} (registry)`, () => {
    const variantKeys = getVariantKeys(family).filter(k => getVariantConfig(family, k) !== null)
    const acceptedKeys = FAMILY_ACCEPTED_KEYS[family]

    if (variantKeys.length === 0) {
      it.skip(`no variants registered for ${family}`, () => {})
    } else {
      it.each(variantKeys)('%s: all config keys are recognized', (variantKey) => {
        const config = getVariantConfig(family, variantKey)
        if (!config) return

        const allKeys = Object.keys(config)
        const unknown = allKeys.filter(k =>
          !acceptedKeys.has(k) && !PLAY_LAYER_KEYS.has(k)
        )

        expect(unknown).toEqual([])
      })
    }
  })
}

// The frontmatter half of this file used to inspect `resolved.plugins[family]`
// only. That is the nested block an author writes under `plugins:`; it is not
// what the plugin receives. `resolveMeta` folds every non-structural key from
// the whole engine block into the plugin config, so a rule declared at the top
// level - `promotion_zone`, `dual_king`, `setup_phase` - never appeared in what
// the old assertion looked at. For placement-chess and shogun the nested block
// is literally empty, so the check passed on `{}` while the plugin was handed a
// key it does not read. Four variants shipped `playable: true` with their
// defining mechanic inert because of it.
function foldedPluginConfig(family, slug) {
  const resolved = resolveFromDisk(family, slug)
  if (!resolved) return null
  const config = { ...(resolved.plugins?.[family] || {}) }
  for (const [k, v] of Object.entries(resolved)) {
    if (STRUCTURAL_KEYS.has(k)) continue
    if (v !== undefined) config[k] = v
  }
  return config
}

// Keys that survive the fold, are read by nobody, and are known to be there.
// Shrink-only: fixing a variant removes its entry, and a new unclaimed key
// fails the ratchet rather than joining the noise.
const UNCLAIMED = {
  'chess|approximations': 1,          // congo
  'chess|asymmetric': 6,              // empire khans-chess shinobi shinobiplus spartan synochess
  'chess|dual_king': 1,               // spartan - the second king is the whole variant
  'chess|faceoff': 1,                 // synochess
  'chess|gating': 1,                  // s-chess
  'chess|hand': 5,                    // s-chess shinobi shinobiplus shogun synochess
  'chess|promotion_zone': 2,          // shinobi shogun - plugin reads promotionRow
  'chess|rendering_note': 1,          // raumschach
  'chess|setup_phase': 1,             // placement-chess - the placement phase is the game
  'chess|setup_status': 1,            // yalta-chess
  'draughts|removeImmediately': 4,    // a default the plugin never reads
  'draughts|unsupported': 20,         // deliberate prose in the draughts rulebook
}
const UNCLAIMED_CEILING = Object.values(UNCLAIMED).reduce((a, b) => a + b, 0)

describe('resolved plugin config has no unclaimed keys (engine#139)', () => {
  const counts = {}
  let variantsChecked = 0

  for (const family of FAMILIES) {
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    if (!existsSync(variantsDir)) continue
    const slugs = readdirSync(variantsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    for (const slug of slugs) {
      const config = foldedPluginConfig(family, slug)
      if (!config) continue
      variantsChecked++
      for (const key of unknownConfigKeys(config, FAMILY_ACCEPTED_KEYS[family])) {
        counts[`${family}|${key}`] = (counts[`${family}|${key}`] || 0) + 1
      }
    }
  }

  // A guard that inspects nothing passes. Assert it inspected the corpus.
  it('walks the whole variant corpus', () => {
    expect(variantsChecked).toBeGreaterThan(200)
  })

  it('introduces no new unclaimed key', () => {
    const novel = Object.keys(counts).filter(k => !(k in UNCLAIMED)).sort()
    expect(novel).toEqual([])
  })

  it('does not widen an existing unclaimed key', () => {
    const widened = Object.entries(counts)
      .filter(([k, n]) => k in UNCLAIMED && n > UNCLAIMED[k])
      .map(([k, n]) => `${k}: ${n} > ${UNCLAIMED[k]}`)
    expect(widened).toEqual([])
  })

  it('ratchet only shrinks', () => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(UNCLAIMED_CEILING)
  })
})
