import '../index.js'
import { listVariants, getVariantConfig } from '../../../play/src/variant-registry.js'
import { pluginConfigFromVariant } from '../../../play/src/variant-definition.js'

const ALL_VARIANTS = listVariants('chess').map(v => v.key)

// Keys that createChessPlugin actually reads from variantConfig.
// Derived by reading chess-plugin.js: every config.X access.
const ACCEPTED_KEYS = new Set([
  'setup', 'promotionChoices', 'castling', 'enPassant', 'royalType',
  'pawnType', 'rookType', 'pieces', 'vocabulary', 'noCheck',
  'stalemateMeaning', 'moveFilter', 'winCondition', 'evaluate',
  'openingBook', 'torpedo', 'doubleStep', 'advancement', 'pawnConfig',
  'checkThreshold', 'afterMove', 'turnLogic', 'onTurnEnd', 'pawnStartRow', 'moveApply',
  'drops', 'visibility',
])
// checkThreshold is read via ctx.config in winCondition, which the
// plugin passes. It is genuinely consumed, not an allowance.

// Keys consumed by the play layer (variant-definition.js strips these
// before passing to the plugin, so they never reach createChessPlugin)
const PLAY_LAYER_KEYS = new Set([
  'key', 'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology',
  'rows', 'cols', 'size', 'players',
])

describe('chess config validation (Tier 1: unknown keys)', () => {
  it.each(ALL_VARIANTS)('%s: all config keys are recognized', (variantKey) => {
    const config = getVariantConfig('chess', variantKey)
    const allKeys = Object.keys(config)

    const unknown = allKeys.filter(k =>
      !ACCEPTED_KEYS.has(k) && !PLAY_LAYER_KEYS.has(k)
    )

    expect(unknown).toEqual([])
  })
})
