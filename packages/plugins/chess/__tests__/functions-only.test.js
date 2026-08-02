import '../index.js'
import { listVariants, getVariantConfig } from '../../../play/src/variant-registry.js'

// Existing variants pre-dating the functions-only rule.
// Remove entries as they migrate to frontmatter-only data.
// The allow-list shrinking to empty is the migration's progress bar.
const LEGACY_ALLOW = new Set([
  'standard', 'noCastling', 'torpedo', 'threeCheck', 'fiveCheck',
  'kingOfTheHill', 'racingKings', 'antichess', 'capablanca',
  'losAlamos', 'horde', 'stalemateWins', 'checklessChess',
  'extinction', 'singleCheck', 'codrus', 'omnicide',
  'breakthrough', 'shatar',
  'giveaway', 'suicideChess', 'noRetreat', 'patrolChess', 'makpong',
  'gridChess', 'madrasiChess', 'weakChess',
  'immunizationChess', 'poisonChess', 'medusaChess',
])

const DATA_KEYS = new Set([
  'setup', 'rows', 'cols', 'size', 'pieces', 'vocabulary',
  'promotionChoices', 'castling', 'enPassant', 'doubleStep',
  'torpedo', 'noCheck', 'stalemateMeaning', 'royalType',
  'pawnType', 'rookType', 'advancement', 'pawnConfig',
  'checkThreshold',
  'label', 'title', 'group', 'description', 'rule', 'board',
  'extends', 'hidden', 'playerNames', 'players',
])

describe('functions-only registry rule (#71)', () => {
  const variants = listVariants('chess')
  const newVariants = variants.filter(v => !LEGACY_ALLOW.has(v.key))

  if (newVariants.length > 0) {
    it.each(newVariants.map(v => v.key))('%s: registry entry contains only functions + key', (key) => {
      const config = getVariantConfig('chess', key)
      const dataFields = Object.entries(config).filter(([k, v]) => {
        if (k === 'key') return false
        if (typeof v === 'function') return false
        if (k === 'openingBook') return false
        return DATA_KEYS.has(k)
      })
      expect(dataFields.map(([k]) => k)).toEqual([])
    })
  }

  it('legacy allow-list documents the migration backlog', () => {
    const registered = new Set(variants.map(v => v.key))
    const stale = [...LEGACY_ALLOW].filter(k => !registered.has(k))
    expect(stale).toEqual([])
  })
})
