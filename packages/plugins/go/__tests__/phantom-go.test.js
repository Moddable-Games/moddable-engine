import { createGameForVariant } from '../../../play/src/fen.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import '../../index.js'

// Phantom Go. The players sit back to back and see only their own stones; a
// referee keeps the master board and announces captures to both. engine#155.
//
// Unlike fog-of-war chess there is nothing to draw where an opponent's stone
// stands - an empty point and a hidden stone are indistinguishable, and that
// is the game. So the projection nulls the point rather than marking it, which
// also means the view leaks no count of what is hidden.

function game(seed = 4) {
  return createGameForVariant('go', 'phantom-go', { rngSeed: seed })
}
const truth = g => g.raw.store.get('go')

function playOn(g, plies, step = 13) {
  for (let i = 0; i < plies; i++) {
    const moves = g.getLegalMoves()
    if (!moves.length) return
    g.applyMove(moves[(i * step) % moves.length])
  }
}

describe('each player sees only their own stones', () => {
  it('declares that its slice holds a secret', () => {
    expect(game().hasHiddenState()).toBe(true)
  })

  it('a seat is shown its own stones and none of the opponent\'s', () => {
    const g = game()
    playOn(g, 12)
    const master = truth(g).board.filter(Boolean).length
    expect(master).toBeGreaterThan(4)

    let totalSeen = 0
    for (const seat of [0, 1]) {
      const colour = ['black', 'white'][seat]
      const seen = g.viewForSeat(seat).go.board.filter(Boolean)
      expect(seen.every(cell => cell === colour)).toBe(true)
      expect(seen.length).toBeGreaterThan(0)
      totalSeen += seen.length
    }
    // between them they see the whole board, and separately neither sees it
    expect(totalSeen).toBe(master)
  })

  it('a hidden stone is indistinguishable from an empty point', () => {
    const g = game()
    playOn(g, 12)
    const master = truth(g).board
    const seen = g.viewForSeat(0).go.board
    const hiddenPoints = master.map((c, i) => (c === 'white' ? i : -1)).filter(i => i >= 0)
    expect(hiddenPoints.length).toBeGreaterThan(0)
    for (const i of hiddenPoints) expect(seen[i]).toBeNull()
  })

  it('nothing in a serialised view names the opponent\'s colour', () => {
    const g = game()
    playOn(g, 12)
    const wire = JSON.stringify(g.viewForSeat(0).go.board)
    expect(wire).not.toContain('white')
    expect(wire).toContain('black')
  })
})

describe('the referee announces captures to both players', () => {
  function playUntilCapture(g) {
    for (let i = 0; i < 400; i++) {
      const moves = g.getLegalMoves()
      if (!moves.length) return null
      g.applyMove(moves[(i * 29 + 7) % moves.length])
      const log = truth(g).announcements
      if (log && log.length) return log
    }
    return null
  }

  it('records which stones were captured, and by whom', () => {
    const log = playUntilCapture(game(9))
    expect(log).not.toBeNull()
    const entry = log[0]
    expect(entry.kind).toBe('capture')
    expect([0, 1]).toContain(entry.by)
    expect(Array.isArray(entry.stones)).toBe(true)
    expect(entry.stones.length).toBeGreaterThan(0)
  })

  it('and both seats hear it, because that is what the rules say', () => {
    const g = game(9)
    const log = playUntilCapture(g)
    expect(log).not.toBeNull()
    for (const seat of [0, 1]) {
      expect(g.viewForSeat(seat).go.announcements).toEqual(log)
    }
  })

  it('the log is in the slice, so a player who reconnects can hear it again', () => {
    const g = game(9)
    playUntilCapture(g)
    const snapshot = JSON.parse(JSON.stringify(truth(g)))
    expect(snapshot.announcements.length).toBeGreaterThan(0)
  })
})

describe('ordinary Go is untouched', () => {
  it.each(['standard', 'capture-go'])('%s declares no secret and hides nothing', (variant) => {
    const g = createGameForVariant('go', variant)
    expect(g.hasHiddenState()).toBe(false)
  })

  it('and a plain Go board is shown in full', () => {
    const g = createGameForVariant('go', 'standard')
    playOn(g, 10)
    expect(g.viewForSeat(0).go.board).toEqual(truth(g).board)
  })
})
