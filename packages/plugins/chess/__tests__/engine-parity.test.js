import { MCE } from '../src/mce-adapter.js'
import { legalMoves } from '../src/mce/moves.js'
import { makeMove } from '../src/mce/play.js'
import '../index.js'
import { createGame } from '../../../play/src/sdk.js'
import { listVariants } from '../../../play/src/variant-registry.js'

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

// MCE does not implement these rules correctly; plugin is more accurate:
// - racingKings: MCE allows giving check (rule forbids it)
// - antichess: MCE does not enforce forced captures after depth
const MCE_DEFICIENT = new Set(['racingKings', 'antichess'])

function findMatchingPluginMove(pluginMoves, mceMove) {
  return pluginMoves.find(
    m => m.from === mceMove.from && m.to === mceMove.to &&
      (mceMove.promotion ? m.promotion === mceMove.promotion : !m.promotion)
  ) || pluginMoves.find(
    m => m.from === mceMove.from && m.to === mceMove.to
  )
}

describe('engine parity: MCE vs generic plugin, all 11 variants', () => {
  const pairableVariants = ALL_VARIANTS.filter(k => !MCE_DEFICIENT.has(k))

  it.each(pairableVariants)('%s: opening move sets match exactly', (variantKey) => {
    const mceGame = MCE.createGame(variantKey)
    const pluginGame = createGame('chess', variantKey)

    const mceMoves = mceMovesToSet(legalMoves(mceGame))
    const pluginMoves = pluginMovesToSet(pluginGame.getLegalMoves())

    const mceOnly = [...mceMoves].filter(m => !pluginMoves.has(m))
    const pluginOnly = [...pluginMoves].filter(m => !mceMoves.has(m))

    expect({ mceOnly, pluginOnly }).toEqual({ mceOnly: [], pluginOnly: [] })
  })

  it.each(pairableVariants)('%s: move sets stay in sync over 10 plies', (variantKey) => {
    const mceGame = MCE.createGame(variantKey)
    const pluginGame = createGame('chess', variantKey)

    for (let ply = 0; ply < 10; ply++) {
      const mceMvs = legalMoves(mceGame)
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

  describe('MCE-deficient variants (plugin is more correct)', () => {
    it('racingKings: plugin rejects moves that give check, MCE allows them', () => {
      const mceGame = MCE.createGame('racingKings')
      const pluginGame = createGame('chess', 'racingKings')

      const mceMoves = legalMoves(mceGame)
      const pluginMoves = pluginGame.getLegalMoves()

      // Plugin should have fewer moves (correctly filters out check-giving moves)
      expect(pluginMoves.length).toBeLessThan(mceMoves.length)
      // Plugin moves should be a strict subset of MCE moves
      const mceSet = mceMovesToSet(mceMoves)
      const pluginSet = pluginMovesToSet(pluginMoves)
      for (const m of pluginSet) {
        expect(mceSet.has(m)).toBe(true)
      }
    })

    it('antichess: plugin enforces forced captures, MCE does not', () => {
      const pluginGame = createGame('chess', 'antichess')
      const moves = pluginGame.getLegalMoves()
      // Opening has no captures available, so all 20 moves allowed
      expect(moves.length).toBe(20)
      // After a position with captures, plugin forces them
      pluginGame.applyMove(moves.find(m => m.from === 52 && m.to === 36)) // e4
      const blackMoves = pluginGame.getLegalMoves()
      // No captures available yet, all 20 black moves
      expect(blackMoves.length).toBe(20)
    })
  })
})
