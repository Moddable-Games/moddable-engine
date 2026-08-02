import '../index.js'
import { MCE } from '../src/mce-adapter.js'
import { variantLegalMoves, getVariantStatus } from '../src/mce/variants-util.js'
import { makeMove, getStatus } from '../src/mce/play.js'
import { createGame } from '../../../play/src/sdk.js'

function normaliseOutcome(outcome, variant, mceGame) {
  if (!outcome) return null
  const s = String(outcome)
  if (s === 'active' || s === 'check') return null
  if (s === 'checkmate') {
    return mceGame.turn === MCE.WHITE ? 'black-wins' : 'white-wins'
  }
  if (s.endsWith('-w') || s === 'white') return 'white-wins'
  if (s.endsWith('-b') || s === 'black') return 'black-wins'
  if (s === 'stalemate') {
    const vc = MCE.variantRegistry[variant]
    if (vc && vc.stalemateMeaning === 'win') {
      return mceGame.turn === MCE.WHITE ? 'white-wins' : 'black-wins'
    }
    if (vc && vc.stalemateMeaning === 'loss') {
      return mceGame.turn === MCE.WHITE ? 'black-wins' : 'white-wins'
    }
    return 'draw'
  }
  if (s === 'draw' || s.startsWith('draw')) return 'draw'
  return s
}

describe('outcome normaliser: checkmate polarity', () => {
  it('scholar mate (white checkmates black) normalises to white-wins from both engines', () => {
    const mce = MCE.createGame('standard')
    const plugin = createGame('chess', 'standard')
    const moves = [[52,36],[12,28],[59,31],[1,18],[61,34],[6,21],[31,13]]
    for (const [from, to] of moves) {
      const mceMoves = variantLegalMoves(mce)
      const mceMove = mceMoves.find(m => m.from === from && m.to === to)
      expect(mceMove).toBeTruthy()
      makeMove(mce, mceMove)
      plugin.applyMove({ from, to })
    }

    const mceStatus = getVariantStatus(mce) || getStatus(mce)
    const pluginResult = plugin.checkWin()

    expect(mceStatus).toBe('checkmate')
    expect(mce.turn).toBe(MCE.BLACK)
    expect(normaliseOutcome(mceStatus, 'standard', mce)).toBe('white-wins')
    expect(normaliseOutcome(pluginResult, 'standard', mce)).toBe('white-wins')
  })

  it('fool mate (black checkmates white) normalises to black-wins from both engines', () => {
    const mce = MCE.createGame('standard')
    const plugin = createGame('chess', 'standard')
    const moves = [[53,45],[12,28],[54,38],[3,39]]
    for (const [from, to] of moves) {
      const mceMoves = variantLegalMoves(mce)
      const mceMove = mceMoves.find(m => m.from === from && m.to === to)
      expect(mceMove).toBeTruthy()
      makeMove(mce, mceMove)
      plugin.applyMove({ from, to })
    }

    const mceStatus = getVariantStatus(mce) || getStatus(mce)
    const pluginResult = plugin.checkWin()

    expect(mceStatus).toBe('checkmate')
    expect(mce.turn).toBe(MCE.WHITE)
    expect(normaliseOutcome(mceStatus, 'standard', mce)).toBe('black-wins')
    expect(normaliseOutcome(pluginResult, 'standard', mce)).toBe('black-wins')
  })

  it('stalemateMeaning=loss: stalemated side loses (mce stalemate -> winner)', () => {
    const mce = MCE.createGame('giveaway')
    mce.turn = MCE.BLACK
    expect(normaliseOutcome('stalemate', 'giveaway', mce)).toBe('white-wins')
    mce.turn = MCE.WHITE
    expect(normaliseOutcome('stalemate', 'giveaway', mce)).toBe('black-wins')
  })

  it('stalemateMeaning=win: stalemated side wins', () => {
    const mce = MCE.createGame('antichess')
    mce.turn = MCE.BLACK
    expect(normaliseOutcome('stalemate', 'antichess', mce)).toBe('black-wins')
    mce.turn = MCE.WHITE
    expect(normaliseOutcome('stalemate', 'antichess', mce)).toBe('white-wins')
  })

  it('draw variants normalise stalemate to draw', () => {
    const mce = MCE.createGame('standard')
    mce.turn = MCE.WHITE
    expect(normaliseOutcome('stalemate', 'standard', mce)).toBe('draw')
    mce.turn = MCE.BLACK
    expect(normaliseOutcome('stalemate', 'standard', mce)).toBe('draw')
  })
})
