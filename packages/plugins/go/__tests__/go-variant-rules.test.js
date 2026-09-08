import { scoreGame } from '../src/scoring.js'

// engine#162. Sunjang Baduk and Tibetan Go each score differently from ordinary
// Go, and neither difference is a variation on komi.

const SIZE = 9
const idx = (r, c) => r * SIZE + c
const neighbours = (pos) => {
  const r = Math.floor(pos / SIZE); const c = pos % SIZE
  const out = []
  if (r > 0) out.push(pos - SIZE)
  if (r < SIZE - 1) out.push(pos + SIZE)
  if (c > 0) out.push(pos - 1)
  if (c < SIZE - 1) out.push(pos + 1)
  return out
}
const empty = () => new Array(SIZE * SIZE).fill(null)

// A wall down column 2 gives Black the two columns to its left as territory.
function walled() {
  const board = empty()
  for (let r = 0; r < SIZE; r += 1) board[idx(r, 2)] = 'black'
  return board
}

describe('Sunjang Baduk ignores prisoners (engine#162)', () => {
  const board = walled()
  const captures = { 0: 7, 1: 3 }

  it('counts them in ordinary territory scoring', () => {
    const s = scoreGame({ board, captures }, { getNeighbours: neighbours, komi: 0 })
    expect(s.scores.black).toBe(s.territory.black + 7)
  })

  it('leaves them out when the variant says so', () => {
    const s = scoreGame({ board, captures }, { getNeighbours: neighbours, komi: 0, prisoners: false })
    expect(s.scores.black).toBe(s.territory.black)
    expect(s.scores.white).toBe(s.territory.white)
  })
})

describe('Tibetan Go pays for holding particular points (engine#162)', () => {
  const bonus = [
    { name: 'corners', points: 'corners', award: 20 },
    { name: 'tengen', points: 'centre', award: 5 },
  ]
  const opts = { getNeighbours: neighbours, komi: 0, positionBonus: bonus, cols: SIZE, rows: SIZE }

  it('pays nothing while the corners are shared', () => {
    const board = empty()
    board[idx(0, 0)] = 'black'
    board[idx(8, 8)] = 'white'
    expect(scoreGame({ board }, opts).bonuses).toEqual([])
  })

  it('pays 20 for holding all four corners, and 5 more for the centre', () => {
    const board = empty()
    for (const p of [idx(0, 0), idx(0, 8), idx(8, 0), idx(8, 8)]) board[p] = 'black'
    const without = scoreGame({ board }, opts)
    expect(without.bonuses.map(b => b.award)).toEqual([20])

    board[idx(4, 4)] = 'black'
    const withCentre = scoreGame({ board }, opts)
    expect(withCentre.bonuses.map(b => b.award).sort()).toEqual([20, 5].sort())
    // The score rises by four, not five: standing on tengen wins the 5-point
    // bonus and gives up the one point of territory that intersection was
    // worth while it stood empty. Both are correct and they are not the same
    // number, which is the sort of thing a bonus rule bolted onto territory
    // scoring gets wrong.
    expect(withCentre.scores.black - without.scores.black).toBe(4)
  })

  it('pays the player who holds them, not always Black', () => {
    const board = empty()
    for (const p of [idx(0, 0), idx(0, 8), idx(8, 0), idx(8, 8)]) board[p] = 'white'
    const s = scoreGame({ board }, opts)
    expect(s.bonuses).toEqual([{ award: 20, to: 'white', name: 'corners' }])
  })
})

// The ko rule Tibetan Go uses is broader than the ordinary one, and the
// difference is visible in the plugin rather than only in the config.
describe("Tibetan Go's ko rule forbids every point just cleared (engine#162)", () => {
  it('is declared by the variant and reaches the plugin', async () => {
    await import('../index.js')
    await import('../../../play/test-helpers/setup-rules-reader.js')
    const { createGameForFamily } = await import('../../../play/src/play.js')
    const { findFamilyPlugin } = await import('../../../play/index.js')
    const g = createGameForFamily('go', { variant: 'tibetan' })
    const plugin = findFamilyPlugin(g.raw.registry.getPlugins(), 'go')
    expect(plugin.config.koRule).toBe('any-removed')
    expect(plugin.config.komi).toBe(0)
  })

  it('leaves ordinary Go alone', async () => {
    await import('../index.js')
    await import('../../../play/test-helpers/setup-rules-reader.js')
    const { createGameForFamily } = await import('../../../play/src/play.js')
    const { findFamilyPlugin } = await import('../../../play/index.js')
    const g = createGameForFamily('go', { variant: '9x9' })
    const plugin = findFamilyPlugin(g.raw.registry.getPlugins(), 'go')
    expect(plugin.config.koRule).toBeUndefined()
  })
})
