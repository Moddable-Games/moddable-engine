import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import '../../../play/src/bootstrap-plugins.js'
import { listVariants, getVariantConfig } from '../../../play/src/variant-registry.js'
import { resolveFromDisk, STRUCTURAL_KEYS, setRulesReader } from '../../../play/src/play.js'
import { pluginConfigFromVariant } from '../../../play/src/variant-definition.js'
import { CONFIG_KEYS } from '../src/chess-plugin.js'
import { PLATFORM_KEYS, COMMON_PLUGIN_KEYS } from '../../../core/src/plugin-config-keys.js'

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

import { getVariantKeys } from '../../../play/src/variant-registry.js'
const ALL_VARIANTS = getVariantKeys('chess').filter(k => getVariantConfig('chess', k) !== null)

// The set of keys the plugin consumes is the plugin's own export, not a copy
// kept here. This list used to be hand-maintained, and drifted twice: once when
// `promotionZone` was added and once when `placementZone` was, each time
// failing a variant for declaring a key the plugin does read.
const ACCEPTED_KEYS = CONFIG_KEYS

// Keys that only ever appear on a Tier 2 JS variant definition, which the play
// layer strips before the config reaches createChessPlugin. Frontmatter keys
// belong in PLATFORM_KEYS or COMMON_PLUGIN_KEYS in packages/core, not here.
const PLAY_LAYER_KEYS = new Set([
  'key', 'label', 'group', 'description', 'rule', 'board',
  'hidden', 'definition', 'playerNames', 'size',
])

const isUnknown = (key) =>
  !ACCEPTED_KEYS.has(key) &&
  !PLAY_LAYER_KEYS.has(key) &&
  !PLATFORM_KEYS.has(key) &&
  !COMMON_PLUGIN_KEYS.has(key) &&
  !STRUCTURAL_KEYS.includes(key)

describe('chess config validation (Tier 1: unknown keys)', () => {
  // An it.each over an empty list is a pass that proves nothing. start-position-canon
  // ran that way for weeks after #136 step 8 moved variant registration into
  // bootstrap-plugins, and only its coverage floor made the collapse visible.
  const VARIANT_FLOOR = 40
  it('registry coverage meets floor', () => {
    expect(ALL_VARIANTS.length).toBeGreaterThanOrEqual(VARIANT_FLOOR)
  })

  it.each(ALL_VARIANTS)('%s: all config keys are recognized', (variantKey) => {
    const config = getVariantConfig('chess', variantKey)
    const allKeys = Object.keys(config)

    const unknown = allKeys.filter(isUnknown)

    expect(unknown).toEqual([])
  })
})

describe('chess config validation (Tier 1: frontmatter variants)', () => {
  const variantsDir = join(RULES_ROOT, 'chess', 'content', 'variants')
  let allSlugs = []
  try {
    allSlugs = readdirSync(variantsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
  } catch { /* no rules dir in CI without checkout */ }

  if (allSlugs.length === 0) {
    it.skip('no frontmatter variants found (missing moddable-rules checkout)', () => {})
  } else {
    it.each(allSlugs)('%s: resolved plugin config has no unknown keys', (slug) => {
      const resolved = resolveFromDisk('chess', slug)
      if (!resolved) return
      const pluginConfig = resolved.plugins?.chess || {}
      const allKeys = Object.keys(pluginConfig)

      const unknown = allKeys.filter(isUnknown)

      expect(unknown).toEqual([])
    })
  }
})
