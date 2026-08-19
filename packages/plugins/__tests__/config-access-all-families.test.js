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
import '../chess/index.js'
import '../go/index.js'
import '../draughts/index.js'
import '../reversi/index.js'
import '../shogi/index.js'
import '../xiangqi/index.js'

import { getVariantConfig, getVariantKeys } from '../../play/src/variant-registry.js'
import { resolveFromDisk, setRulesReader } from '../../play/src/play.js'

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

// Per-family accepted keys (derived from reading each plugin's config.* accesses)
const FAMILY_ACCEPTED_KEYS = {
  chess: new Set([
    'setup', 'promotionChoices', 'castling', 'enPassant', 'royalType',
    'pawnType', 'rookType', 'pieces', 'vocabulary', 'noCheck',
    'stalemateMeaning', 'moveFilter', 'winCondition', 'evaluate',
    'openingBook', 'torpedo', 'doubleStep', 'advancement', 'pawnConfig',
    'checkThreshold', 'afterMove', 'turnLogic', 'onTurnEnd', 'pawnStartRow', 'moveApply',
    'drops', 'visibility', 'placementPieces', 'actions', 'initState',
    'hexPawnConfig', 'pawnMoveDirections', 'pawnCaptureDirections', 'promotionRow',
    'playerCount', 'randomSetup', 'hooks',
  ]),
  go: new Set([
    'setup', 'playerColours', 'komi', 'scoring', 'superko', 'allowPass',
    'suicideAllowed', 'captures', 'captureTarget', 'winCondition', 'vocabulary',
    'evaluate', 'directions', 'winBy', 'hooks',
  ]),
  draughts: new Set([
    'setup', 'vocabulary', 'directions', 'manMove', 'manCapture', 'captureBackward',
    'flyingKings', 'promotionDuring', 'piecesPerPlayer', 'forcedCapture',
    'maxCapture', 'maximalCapture', 'captureMethod', 'captureRule', 'winCondition', 'hooks',
    'menCannotCaptureKings', 'kingCapturePriority', 'removeImmediately',
    'loseOnSinglePiece', 'majorityPrefersKing',
  ]),
  reversi: new Set([
    'setup', 'vocabulary', 'winCondition', 'passRule', 'passWhenNoMoves',
    'evaluate', 'hooks', 'directions', 'mustFlip', 'winBy',
  ]),
  shogi: new Set([
    'setup', 'vocabulary', 'pieces', 'pieceMoves', 'promotionZone', 'drops', 'dropRestrictions',
    'winCondition', 'checkEnabled', 'hooks', 'capturedPieces', 'playerCount',
    'advancementDirection', 'advancement', 'custodianCapture', 'evaluate',
    'initialHands', 'mustFlip', 'nifuLimit', 'nifuType', 'noDropLastRank', 'noDropSecondRank',
    'dropCheckmateLimit', 'royalType', 'captureRule',
  ]),
  xiangqi: new Set([
    'setup', 'vocabulary', 'pieces', 'palace', 'river', 'hasRiver', 'flyingGeneral', 'flyingGeneralRule',
    'winCondition', 'winBy', 'checkEnabled', 'directions', 'cannonJumpToMove',
  ]),
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

for (const family of FAMILIES) {
  describe(`config-access validation: ${family} (frontmatter)`, () => {
    const variantsDir = join(RULES_ROOT, family, 'content', 'variants')
    let allSlugs = []
    if (existsSync(variantsDir)) {
      try {
        allSlugs = readdirSync(variantsDir)
          .filter(f => f.endsWith('.md'))
          .map(f => f.replace('.md', ''))
      } catch { /* no variants dir */ }
    }

    const acceptedKeys = FAMILY_ACCEPTED_KEYS[family]

    if (allSlugs.length === 0) {
      it.skip(`no frontmatter variants found for ${family}`, () => {})
    } else {
      it.each(allSlugs)('%s: resolved plugin config has no unknown keys', (slug) => {
        const resolved = resolveFromDisk(family, slug)
        if (!resolved) return

        const pluginConfig = resolved.plugins?.[family] || {}
        const allKeys = Object.keys(pluginConfig)
        const unknown = allKeys.filter(k =>
          !acceptedKeys.has(k) && !PLAY_LAYER_KEYS.has(k)
        )

        expect(unknown).toEqual([])
      })
    }
  })
}
