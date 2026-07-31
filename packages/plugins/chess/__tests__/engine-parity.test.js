import { MCE } from '../src/mce-adapter.js'
import { legalMoves } from '../src/mce/moves.js'
import { makeMove } from '../src/mce/play.js'
import '../index.js'
import { createGame } from '../../../play/src/sdk.js'

function mceMovesToSet(moves) {
  return new Set(moves.map(m => `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`))
}

function pluginMovesToSet(moves) {
  return new Set(moves.map(m => {
    if (m.action === 'drop') return `drop:${m.type}@${m.to}`
    return `${m.from}-${m.to}${m.promotion ? '=' + m.promotion : ''}`
  }))
}

function playNMoves(n) {
  const mceGame = MCE.createGame('standard')
  const pluginGame = createGame('chess', 'standard')

  for (let i = 0; i < n; i++) {
    const mceMvs = legalMoves(mceGame)
    const pluginMvs = pluginGame.getLegalMoves()
    if (mceMvs.length === 0 || pluginMvs.length === 0) break

    const mceMove = mceMvs[i % mceMvs.length]
    makeMove(mceGame, mceMove)

    const pluginMove = pluginMvs.find(
      m => m.from === mceMove.from && m.to === mceMove.to && !m.promotion
    ) || pluginMvs.find(m => m.from === mceMove.from && m.to === mceMove.to)
    if (!pluginMove) break
    pluginGame.applyMove(pluginMove)
  }

  return { mceGame, pluginGame }
}

describe('engine parity: MCE vs generic plugin', () => {
  it('opening position produces identical move count', () => {
    const mceGame = MCE.createGame('standard')
    const pluginGame = createGame('chess', 'standard')

    const mceMoves = legalMoves(mceGame)
    const pluginMoves = pluginGame.getLegalMoves()

    expect(pluginMoves.length).toBe(mceMoves.length)
  })

  it('move sets match after 1.e4', () => {
    const mceGame = MCE.createGame('standard')
    const pluginGame = createGame('chess', 'standard')

    const mceE4 = legalMoves(mceGame).find(m => m.from === 52 && m.to === 36)
    makeMove(mceGame, mceE4)

    const pluginE4 = pluginGame.getLegalMoves().find(m => m.from === 52 && m.to === 36)
    pluginGame.applyMove(pluginE4)

    const mceMoves = mceMovesToSet(legalMoves(mceGame))
    const pluginMoves = pluginMovesToSet(pluginGame.getLegalMoves())

    expect(pluginMoves.size).toBe(mceMoves.size)
    for (const m of mceMoves) {
      expect(pluginMoves.has(m)).toBe(true)
    }
  })

  it('move sets match after 4 half-moves', () => {
    const { mceGame, pluginGame } = playNMoves(4)

    const mceMoves = mceMovesToSet(legalMoves(mceGame))
    const pluginMoves = pluginMovesToSet(pluginGame.getLegalMoves())

    expect(pluginMoves.size).toBe(mceMoves.size)
  })

  it('move count stays in sync over 10 half-moves', () => {
    const mceGame = MCE.createGame('standard')
    const pluginGame = createGame('chess', 'standard')

    for (let i = 0; i < 10; i++) {
      const mceMvs = legalMoves(mceGame)
      const pluginMvs = pluginGame.getLegalMoves()
      expect(pluginMvs.length).toBe(mceMvs.length)

      const mceMove = mceMvs[0]
      makeMove(mceGame, mceMove)

      const pluginMove = pluginMvs.find(
        m => m.from === mceMove.from && m.to === mceMove.to && !m.promotion
      ) || pluginMvs.find(m => m.from === mceMove.from && m.to === mceMove.to)
      if (!pluginMove) break
      pluginGame.applyMove(pluginMove)
    }
  })

  it('capablanca opening produces identical move count', () => {
    const mceGame = MCE.createGame('capablanca')
    const pluginGame = createGame('chess', 'capablanca')

    const mceMoves = legalMoves(mceGame)
    const pluginMoves = pluginGame.getLegalMoves()

    expect(pluginMoves.length).toBe(mceMoves.length)
  })
})
