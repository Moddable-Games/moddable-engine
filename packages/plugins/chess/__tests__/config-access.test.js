import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import '../../../play/src/bootstrap-plugins.js'
import { listVariants, getVariantConfig } from '../../../play/src/variant-registry.js'
import { resolveFromDisk, STRUCTURAL_KEYS, setRulesReader } from '../../../play/src/play.js'
import { pluginConfigFromVariant } from '../../../play/src/variant-definition.js'

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

// Keys that createChessPlugin actually reads from variantConfig.
// Derived by reading chess-plugin.js: every config.X access.
const ACCEPTED_KEYS = new Set([
  'setup', 'promotionChoices', 'castling', 'enPassant', 'royalType',
  'pawnType', 'rookType', 'pieces', 'vocabulary', 'noCheck',
  'stalemateMeaning', 'moveFilter', 'winCondition', 'evaluate',
  'openingBook', 'torpedo', 'doubleStep', 'advancement', 'pawnConfig',
  'checkThreshold', 'afterMove', 'turnLogic', 'onTurnEnd', 'pawnStartRow', 'moveApply',
  'drops', 'visibility', 'placementPieces', 'actions', 'initState',
  'hexPawnConfig', 'pawnMoveDirections', 'pawnCaptureDirections', 'promotionRow',
  'playerCount', 'randomSetup', 'hooks',
])

// Keys consumed by the play layer (variant-definition.js strips these
// before passing to the plugin, so they never reach createChessPlugin)
const PLAY_LAYER_KEYS = new Set([
  'key', 'slug', 'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology',
  'rows', 'cols', 'size', 'players',
])

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

    const unknown = allKeys.filter(k =>
      !ACCEPTED_KEYS.has(k) && !PLAY_LAYER_KEYS.has(k)
    )

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

      const unknown = allKeys.filter(k =>
        !ACCEPTED_KEYS.has(k) && !PLAY_LAYER_KEYS.has(k)
      )

      expect(unknown).toEqual([])
    })
  }
})
