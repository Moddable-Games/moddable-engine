import { createMancalaPlugin } from '../index.js'

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
