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

  describe('divergent variants (unresolved, see data/parity-record.json)', () => {
    it('racingKings: implementations disagree on check-filtering', () => {
      const mceGame = MCE.createGame('racingKings')
      const pluginGame = createGame('chess', 'racingKings')

      const mceMoves = legalMoves(mceGame)
      const pluginMoves = pluginGame.getLegalMoves()

      // Divergence documented: MCE has 2 more moves than plugin
      expect(mceMoves.length).not.toBe(pluginMoves.length)
    })

    it('antichess: implementations disagree on forced captures at depth', () => {
      const mceGame = MCE.createGame('antichess')
      const pluginGame = createGame('chess', 'antichess')

      // Opening agrees
      expect(legalMoves(mceGame).length).toBe(pluginGame.getLegalMoves().length)

      // After 3 plies they diverge (plugin forces captures, MCE does not)
      for (let i = 0; i < 3; i++) {
        const mceMvs = legalMoves(mceGame)
        const pluginMvs = pluginGame.getLegalMoves()
        const m = mceMvs[i % mceMvs.length]
        makeMove(mceGame, m)
        const pm = pluginMvs.find(p => p.from === m.from && p.to === m.to)
        if (pm) pluginGame.applyMove(pm)
      }
      const mceCount = legalMoves(mceGame).length
      const pluginCount = pluginGame.getLegalMoves().length
      expect(mceCount).not.toBe(pluginCount)
    })
  })
})
