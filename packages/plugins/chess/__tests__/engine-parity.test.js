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
  return new Set(moves.map(m => `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`))
}

function pluginMovesToSet(moves) {
  return new Set(moves.map(m => {
    if (m.action === 'drop') return `drop:${m.type}@${m.to}`
    return `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`
  }))
}

const ALL_VARIANTS = listVariants('chess').map(v => v.key)

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
      makeMove(mceGame, mceMove)

      const pluginMove = findMatchingPluginMove(pluginMvs, mceMove)
      if (!pluginMove) break
      pluginGame.applyMove(pluginMove)
    }
  })
})
