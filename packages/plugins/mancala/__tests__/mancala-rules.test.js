import { createMancalaPlugin } from '../index.js'
import { createGameForFamily } from '../../../play/src/play.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'

// Positions are hand-checked against the rules text in moddable-rules rather
// than captured from the implementation, so a wrong capture rule fails here
// instead of being enshrined. Two of these caught errors in the expectations
// themselves while they were being written, which is the point of writing them
// from the rules rather than from a run.
function position(config, cells) {
  const plugin = createMancalaPlugin(config)
  const slice = plugin.init({}, { request: () => null })
  slice.board = cells.slice()
  return { plugin, slice }
}

const turn = index => ({ __players: { currentIndex: index } })

const KALAH = { pitsPerSide: 6, sowIntoOwnStore: true, bonusTurnOnStore: true, captureRule: 'oppositeOnEmptyOwn' }
const OWARE = {
  pitsPerSide: 6, hasStores: false, sowIntoOwnStore: false, skipOriginOnWrap: true,
  captureRule: 'countInEnemy', captureCounts: [2, 3], captureChainBackwards: true,
  grandSlamProhibited: true, feedingObligation: true,
}
const TOGUZ = { pitsPerSide: 9, sowIntoOwnStore: false, captureRule: 'evenInEnemy' }
const SUNGKA = { pitsPerSide: 7, sowIntoOwnStore: true, relay: 'nonEmpty', captureRule: 'oppositeOnEmptyOwn' }

describe('kalah', () => {
  it('sows one seed per pit and into its own store', () => {
    const { plugin, slice } = position(KALAH, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 2 }, slice, turn(0))
    expect(after.board).toEqual([4, 4, 0, 5, 5, 5, 4, 4, 4, 4, 4, 4, 1, 0])
  })

  it('grants another turn when the last seed lands in its own store', () => {
    const { plugin, slice } = position(KALAH, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0])
    expect(plugin.continuesTurn({ action: 'sow', pit: 2 }, slice, turn(0))).toBe(true)
  })

  it('takes the facing pit when the last seed lands in an empty pit of its own', () => {
    const { plugin, slice } = position(KALAH, [0, 0, 0, 0, 1, 0, 7, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 4 }, slice, turn(0))
    expect([after.board[5], after.board[6], after.board[12]]).toEqual([0, 0, 8])
  })

  it('takes nothing when the facing pit is empty', () => {
    const { plugin, slice } = position(KALAH, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 4 }, slice, turn(0))
    expect([after.board[5], after.board[12]]).toEqual([1, 0])
  })
})

describe('oware', () => {
  it('chains the capture backwards through consecutive pits of 2 or 3', () => {
    // Sowing 3 from pit 5 leaves 2, 3, 2 in pits 6, 7 and 8. All three go.
    const { plugin, slice } = position(OWARE, [0, 0, 0, 0, 0, 3, 1, 2, 1, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 5 }, slice, turn(0))
    expect([after.board[6], after.board[7], after.board[8]]).toEqual([0, 0, 0])
    expect(after.held).toEqual([7, 0])
  })

  it('stops the chain at the first pit outside 2 or 3', () => {
    const { plugin, slice } = position(OWARE, [0, 0, 0, 0, 0, 3, 1, 4, 1, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 5 }, slice, turn(0))
    expect([after.board[6], after.board[7], after.board[8]]).toEqual([2, 5, 0])
    expect(after.held).toEqual([2, 0])
  })

  it('never chains back onto its own side', () => {
    const { plugin, slice } = position(OWARE, [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 5 }, slice, turn(0))
    expect([after.board[6], after.held[0], after.board[0]]).toEqual([0, 2, 0])
  })

  it('takes nothing when the last seed makes 4', () => {
    const { plugin, slice } = position(OWARE, [0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 5 }, slice, turn(0))
    expect([after.board[6], after.held[0]]).toEqual([4, 0])
  })

  it('excludes a grand slam while a legal alternative exists', () => {
    const { plugin, slice } = position(OWARE, [1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0])
    expect(plugin.getLegalMoves(slice, turn(0)).map(m => m.pit)).toEqual([0])
  })

  it('compels a feeding move when the opponent is bare', () => {
    const { plugin, slice } = position(OWARE, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
    expect(plugin.getLegalMoves(slice, turn(0)).map(m => m.pit)).toEqual([5])
  })
})

describe('toguz korgool', () => {
  it('takes an enemy pit left holding an even count', () => {
    const { plugin, slice } = position(TOGUZ, [0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 8 }, slice, turn(0))
    expect([after.board[9], after.board[18]]).toEqual([0, 4])
  })

  it('leaves an odd count alone', () => {
    const { plugin, slice } = position(TOGUZ, [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 8 }, slice, turn(0))
    expect([after.board[9], after.board[18]]).toEqual([3, 0])
  })

  it('sows no seed into either kazan', () => {
    const { plugin, slice } = position(TOGUZ, [0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 8 }, slice, turn(0))
    expect([after.board[18], after.board[19]]).toEqual([0, 0])
  })
})

describe('sungka', () => {
  it('relays from an occupied landing pit', () => {
    const { plugin, slice } = position(SUNGKA, [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect([after.board[0], after.board[1], after.board[2]]).toEqual([0, 0, 1])
  })
})

// The bonus turn, which is a core Kalah rule and which never once happened.
//
// "If the last seed lands in your own store, you take another turn." Kalah's
// frontmatter declares `bonusTurnOnStore: true`, the plugin implements
// `continuesTurn()` and returns the right answer, and nothing in the engine
// called it. The turn passed to the opponent every time, in every variant that
// has the rule.
//
// It has to be asked BEFORE the move is applied, because the question is about
// where this move's last seed lands, and once the move is applied there is no
// "before" left to ask about. That is why it is its own hook rather than a
// field on the result.
describe('a last seed in your own store earns another turn', () => {
  const setup = (variant) => {
    const game = createGameForFamily('mancala', { variant })
    return { game, first: game.currentPlayer() }
  }

  it('kalah: sowing pit 2 from the opening ends in the store and the turn stays', () => {
    const { game, first } = setup('kalah')
    const perSide = game.getState().slice._pitsPerSide
    // Four seeds from pit 2 reach pits 3, 4, 5 and then the store.
    const result = game.applyMove({ action: 'sow', pit: 2, to: 'pit-2' })
    expect(game.getState().slice.board[perSide * 2]).toBe(1)
    expect(result.continueTurn).toBe(true)
    expect(game.currentPlayer()).toBe(first)
  })

  it('kalah: a sow that ends in a pit passes the turn', () => {
    const { game, first } = setup('kalah')
    const perSide = game.getState().slice._pitsPerSide
    const result = game.applyMove({ action: 'sow', pit: 0, to: 'pit-0' })
    expect(game.getState().slice.board[perSide * 2]).toBe(0)
    expect(result.continueTurn).toBe(false)
    expect(game.currentPlayer()).not.toBe(first)
  })

  it('oware has no store and no bonus turn, so the turn always passes', () => {
    const { game, first } = setup('oware')
    const moves = game.getLegalMoves()
    const result = game.applyMove(moves[0])
    expect(result.continueTurn).toBe(false)
    expect(game.currentPlayer()).not.toBe(first)
  })

  // The sowing itself, checked seed by seed against the published rule: one
  // seed per pit anticlockwise, into your own store, skipping the opponent's.
  it('kalah sows anticlockwise through its own store', () => {
    const { game } = setup('kalah')
    game.applyMove({ action: 'sow', pit: 5, to: 'pit-5' })
    // From pit 5 the next four places are the store, then the opponent's
    // first three pits.
    expect(game.getState().slice.board).toEqual([4, 4, 4, 4, 4, 0, 5, 5, 5, 4, 4, 4, 1, 0])
  })
})

// engine#163. Pallanguzhi relays from the pit AFTER the last seed rather than
// the pit the last seed fell into, and its capture is measured from the empty
// pit that ended the sow: skip it, take the one beyond, then check again from
// there. Neither was expressible, so the variant was declared unsupported
// rather than played with sungka's relay and kalah's capture.
//
// Circuit for either player with no stores is simply 0..13 and round again.
const PALLANGUZHI = {
  pitsPerSide: 7,
  hasStores: false,
  sowIntoOwnStore: false,
  relay: 'next',
  captureRule: 'skipOneBeyond',
}

describe('pallanguzhi', () => {
  it('relays from the pit after the last seed, not the pit it landed in', () => {
    // Two seeds from pit 0 land in 1 and 2. Pit 3 holds one seed, so the relay
    // lifts pit 3 - not pit 2, which is where the last seed fell - and sows it
    // into pit 4. Pit 5 is empty, so the sow stops there.
    const { plugin, slice } = position(PALLANGUZHI, [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect(after.board).toEqual([0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('stops when the pit after the last seed is empty', () => {
    // One seed from pit 0 lands in pit 1. Pit 2 is empty, so there is no relay.
    const { plugin, slice } = position(PALLANGUZHI, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect(after.board[1]).toBe(1)
    expect(after.board[2]).toBe(0)
  })

  it('skips the empty pit and takes the one beyond it', () => {
    // One seed from 0 lands in 1. Pit 2 is empty, so the sow ends; pit 3 holds
    // five and is taken. Held rather than stored: this board has no stores.
    const { plugin, slice } = position(PALLANGUZHI, [1, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect(after.board[3]).toBe(0)
    expect(after.held).toEqual([5, 0])
  })

  it('takes nothing when the pit beyond the empty one is empty too', () => {
    const { plugin, slice } = position(PALLANGUZHI, [1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect(after.held).toEqual([0, 0])
    expect(after.board[4]).toBe(4)
  })

  it('keeps taking while empty and seeded pits alternate', () => {
    // After the sow ends at pit 1: 2 empty, 3 has three; 4 empty, 5 has two;
    // 6 empty, 7 has one. All three are taken in the one turn.
    const { plugin, slice } = position(PALLANGUZHI, [1, 0, 0, 3, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 0 }, slice, turn(0))
    expect(after.held).toEqual([6, 0])
    expect(after.board).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('takes across the board, not only from its own side', () => {
    // The sow ends at pit 8, on the opponent's side; pit 9 is empty and pit 10
    // holds four, so they are taken.
    const { plugin, slice } = position(PALLANGUZHI, [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 4, 0, 0, 0])
    const after = plugin.applyMove({ action: 'sow', pit: 7 }, slice, turn(1))
    expect(after.board[10]).toBe(0)
    expect(after.held).toEqual([0, 4])
  })

  it('creates and destroys no seeds over a whole game', () => {
    const game = createGameForFamily('mancala', { variant: 'pallanguzhi', rngSeed: 9 })
    const total = (state) => state.board.reduce((a, b) => a + b, 0) + (state.held || [0, 0]).reduce((a, b) => a + b, 0)
    const start = total(game.getState()?.slice || game.getState())
    expect(start).toBe(168)
    for (let i = 0; i < 400; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const result = game.applyMove(moves[i % moves.length])
      if (!result || !result.ok) break
      expect(total(game.getState()?.slice || game.getState())).toBe(168)
      if (result.winner !== undefined && result.winner !== null) break
    }
  })
})
