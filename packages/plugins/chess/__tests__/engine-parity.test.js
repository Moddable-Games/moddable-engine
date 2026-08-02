import { MCE } from '../src/mce-adapter.js'
import { legalMoves } from '../src/mce/moves.js'
import { variantLegalMoves } from '../src/mce/variants-util.js'
import { makeMove } from '../src/mce/play.js'
import '../index.js'
import { createGame } from '../../../play/src/sdk.js'
import { listVariants } from '../../../play/src/variant-registry.js'

function getMceLegalMoves(g) {
  const vc = MCE.getVariantConfig(g.variant)
  if (vc && (vc.moveFilter || vc.legalityFilter)) return variantLegalMoves(g)
  return legalMoves(g)
}

function mceMovesToSet(moves) {
  return new Set(moves.map(m => {
    if (m.flag === 'promo' && !m.promotion) return `${m.from}-${m.to}=promo`
    return `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`
  }))
}

function pluginMovesToSet(moves) {
  const seen = new Set()
  const result = new Set()
  for (const m of moves) {
    if (m.action === 'drop') { result.add(`drop:${m.type}@${m.to}`); continue }
    if (m.promotion) {
      const key = `${m.from}-${m.to}=promo`
      if (!seen.has(key)) { seen.add(key); result.add(key) }
    } else {
      result.add(`${m.from}-${m.to}`)
    }
  }
  return result
}

const PARITY_SKIP = new Set([
  'chess960',     // nondeterministic: random starting position
  'upsideDown',   // deferred: en passant target investigation pending
  'makpong',      // no MCE equivalent with Makruk pieces
  'diceChess',    // no standard ruleset (Sunnucks documented, never codified); MCE uses different interpretation
  'crazyhouse',   // hand state shape differs from MCE (array vs keyed object)
  'darkChess',    // visibility hook not in MCE parity scope
  'fogOfWar',     // visibility hook not in MCE parity scope
  'duckChess',    // two-phase turn (duck placement) not comparable to MCE's turnLogic
  'sittuyin',     // placement phase not in MCE
])
const ALL_VARIANTS = listVariants('chess').map(v => v.key).filter(k => !PARITY_SKIP.has(k))

function findMatchingPluginMove(pluginMoves, mceMove) {
  return pluginMoves.find(
    m => m.from === mceMove.from && m.to === mceMove.to &&
      (mceMove.promotion ? m.promotion === mceMove.promotion : !m.promotion)
  ) || pluginMoves.find(
    m => m.from === mceMove.from && m.to === mceMove.to
  )
}

describe('engine parity: MCE vs generic plugin, all 11 variants', () => {
  it.each(ALL_VARIANTS)('%s: opening move sets match exactly', (variantKey) => {
    const mceGame = MCE.createGame(variantKey)
    const pluginGame = createGame('chess', variantKey)

    const mceMoves = mceMovesToSet(getMceLegalMoves(mceGame))
    const pluginMoves = pluginMovesToSet(pluginGame.getLegalMoves())

    const mceOnly = [...mceMoves].filter(m => !pluginMoves.has(m))
    const pluginOnly = [...pluginMoves].filter(m => !mceMoves.has(m))

    expect({ mceOnly, pluginOnly }).toEqual({ mceOnly: [], pluginOnly: [] })
  })

  it.each(ALL_VARIANTS)('%s: move sets stay in sync over 10 plies', (variantKey) => {
    const mceGame = MCE.createGame(variantKey)
    const pluginGame = createGame('chess', variantKey)

    for (let ply = 0; ply < 10; ply++) {
      const mceMvs = getMceLegalMoves(mceGame)
      const pluginMvs = pluginGame.getLegalMoves()

      const mceSet = mceMovesToSet(mceMvs)
      const pluginSet = pluginMovesToSet(pluginMvs)
      const mceOnly = [...mceSet].filter(m => !pluginSet.has(m))
      const pluginOnly = [...pluginSet].filter(m => !mceSet.has(m))

      expect({ ply, mceOnly, pluginOnly }).toEqual({ ply, mceOnly: [], pluginOnly: [] })

      if (mceMvs.length === 0) break

      const mceMove = mceMvs[ply % mceMvs.length]
      if (mceMove.flag === 'promo' && !mceMove.promotion) mceMove.promotion = 'q'
      makeMove(mceGame, mceMove)

      const pluginMove = findMatchingPluginMove(pluginMvs, mceMove)
      if (!pluginMove) break
      pluginGame.applyMove(pluginMove)
    }
  })
})
