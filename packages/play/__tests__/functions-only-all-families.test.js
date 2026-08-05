/**
 * Functions-only conformance: every registered variant across all families.
 *
 * The thesis: games are defined by frontmatter. JS registry entries should
 * contain ONLY functions (hooks, winCondition, evaluate, etc.) plus `key`.
 * Any declarative data field is a migration debt that must eventually move
 * to the variant's .md frontmatter.
 *
 * This test measures the current state per family, enforces a ratchet
 * (the count may only decrease), and fails the build if a new variant
 * adds JS config.
 */
import { listVariants, getVariantConfig } from '../../play/src/variant-registry.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'
import '../../plugins/shogi/index.js'
import '../../plugins/xiangqi/index.js'

// --- Per-family allow-lists: variants that still carry declarative data in JS.
// Shrink these as variants migrate to frontmatter-only.

const LEGACY_ALLOW = {
  chess: new Set([
    'breakthrough', 'makpong', 'maharaja',
    'shatranj', 'chaturanga', 'chess960',
    'diceChess', 'crazyhouse', 'duckChess', 'sittuyin',
    'hexapawn',
    'berolinaChess', 'leganChess', 'makruk',
  ]),
  go: new Set([
    'standard', '13x13', '9x9', 'one-colour',
    'stoical',
    'gomoku', 'ninuki-renju',
  ]),
  draughts: new Set([
    'international', 'brazilian', 'canadian',
    'russian', 'spantsiretti', 'pool',
    'ghanaian',
  ]),
  shogi: new Set([
  ]),
  xiangqi: new Set([
  ]),
}

// Ratchet ceilings: the maximum number of legacy entries allowed per family.
// Lower these as migrations land. A PR that increases any ceiling MUST be rejected.
const LEGACY_CEILING = {
  chess: 14,
  go: 7,
  draughts: 7,
  shogi: 0,
  xiangqi: 0,
}

// Keys that are always acceptable in a registry entry (not data).
const ALWAYS_ALLOWED = new Set(['key', 'extends'])

function isFunction(v) { return typeof v === 'function' }

function isBehaviouralObject(k, v) {
  if (!v || typeof v !== 'object') return false
  if (k === 'hooks') return Object.values(v).every(isFunction)
  if (k === 'actions') {
    return Object.values(v).every(action =>
      action && typeof action === 'object' &&
      Object.values(action).some(isFunction)
    )
  }
  return false
}

for (const [family, allowSet] of Object.entries(LEGACY_ALLOW)) {
  describe(`functions-only: ${family} (${allowSet.size} legacy)`, () => {
    const variants = listVariants(family)

    const newVariants = variants.filter(v => !allowSet.has(v.key))

    if (newVariants.length > 0) {
      it.each(newVariants.map(v => v.key))('%s: registry entry contains only functions + key', (key) => {
        const config = getVariantConfig(family, key)
        if (!config) return
        const dataFields = Object.entries(config).filter(([k, v]) => {
          if (ALWAYS_ALLOWED.has(k)) return false
          if (isFunction(v)) return false
          if (isBehaviouralObject(k, v)) return false
          return true
        })
        expect(dataFields.map(([k]) => k)).toEqual([])
      })
    }

    it('allow-list contains no stale entries', () => {
      const registered = new Set(variants.map(v => v.key))
      const stale = [...allowSet].filter(k => !registered.has(k))
      expect(stale).toEqual([])
    })

    it(`allow-list size (${allowSet.size}) does not exceed ceiling (${LEGACY_CEILING[family]})`, () => {
      expect(allowSet.size).toBeLessThanOrEqual(LEGACY_CEILING[family])
    })
  })
}

describe('functions-only: summary', () => {
  it('reports LEGACY_ALLOW counts', () => {
    const counts = {}
    let total = 0
    for (const [family, allowSet] of Object.entries(LEGACY_ALLOW)) {
      counts[family] = allowSet.size
      total += allowSet.size
    }
    console.log('\n  LEGACY_ALLOW per family:')
    for (const [family, count] of Object.entries(counts)) {
      const ceiling = LEGACY_CEILING[family]
      console.log(`    ${family}: ${count}/${ceiling}`)
    }
    console.log(`    TOTAL: ${total}`)
    expect(total).toBe(28)
  })
})
