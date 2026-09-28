import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, getPlugin } from '../../../play/src/play.js'

// engine#157. Dou Shou Qi is played by the chess plugin, named in its
// rulebook (`engine.plugin: chess`), with every rule declared there: ranks,
// the river, the traps and the den. Positions below are built on an empty
// board so each test sees only the rule it is about.

const COLS = 7
const at = (sq) => (9 - Number(sq.slice(1))) * COLS + 'abcdefg'.indexOf(sq[0])
const alg = (i) => 'abcdefg'[i % COLS] + (9 - Math.floor(i / COLS))
const WHITE = 0
const BLACK = 1

function position(pieces, toMove = WHITE) {
  const g = createGameForFamily('dou-shou-qi', { variant: 'standard', rngSeed: 1 })
  const slice = g.getState().slice
  const board = slice.board.map(() => null)
  for (const [sq, type, owner] of pieces) board[at(sq)] = { type, owner }
  g.loadState({ slice: { ...slice, board }, players: { currentIndex: toMove } })
  return g
}

const targetsFrom = (g, sq) => g.getLegalMoves().filter(m => m.from === at(sq)).map(m => alg(m.to)).sort()
const capturesFrom = (g, sq) => g.getLegalMoves().filter(m => m.from === at(sq) && m.capture).map(m => alg(m.to)).sort()

describe('Dou Shou Qi plays through the chess plugin (engine#157)', () => {
  it('is a family of its own, handed to the plugin its rulebook names', () => {
    expect(getPlugin('dou-shou-qi')?.factory).toBe(getPlugin('chess').factory)
  })

  it('opens with every animal stepping one square over land', () => {
    const g = createGameForFamily('dou-shou-qi', { variant: 'standard', rngSeed: 1 })
    expect(g.getLegalMoves()).toHaveLength(24)
    for (const m of g.getLegalMoves()) {
      const dr = Math.abs(Math.floor(m.from / COLS) - Math.floor(m.to / COLS))
      const dc = Math.abs((m.from % COLS) - (m.to % COLS))
      expect(dr + dc).toBe(1)
    }
  })
})

describe('the river', () => {
  it('lets the Rat swim and keeps every other animal out', () => {
    const g = position([['a4', 'rat', WHITE], ['g4', 'dog', WHITE], ['b7', 'cat', BLACK]])
    expect(targetsFrom(g, 'a4')).toEqual(['a3', 'a5', 'b4'])
    expect(targetsFrom(g, 'g4')).toEqual(['g3', 'g5'])
  })

  it('carries the Lion and the Tiger across to the first land square', () => {
    const g = position([['b3', 'lion', WHITE], ['a5', 'tiger', WHITE], ['g9', 'cat', BLACK]])
    expect(targetsFrom(g, 'b3')).toContain('b7')
    expect(targetsFrom(g, 'a5')).toContain('d5')
    expect(targetsFrom(g, 'b3')).not.toContain('b4')
  })

  it('is closed to a leap while a Rat of either colour swims in the path', () => {
    for (const owner of [WHITE, BLACK]) {
      const g = position([['b3', 'lion', WHITE], ['b5', 'rat', owner], ['g9', 'cat', BLACK]])
      expect(targetsFrom(g, 'b3')).not.toContain('b7')
    }
    const clear = position([['b3', 'lion', WHITE], ['c5', 'rat', BLACK], ['g9', 'cat', BLACK]])
    expect(targetsFrom(clear, 'b3')).toContain('b7')
  })

  it('lets a leap capture on the far bank, subject to rank', () => {
    const takes = position([['b3', 'tiger', WHITE], ['b7', 'leopard', BLACK]])
    expect(capturesFrom(takes, 'b3')).toEqual(['b7'])
    const cannot = position([['b3', 'tiger', WHITE], ['b7', 'elephant', BLACK]])
    expect(capturesFrom(cannot, 'b3')).toEqual([])
  })
})

describe('capture by rank', () => {
  it('takes an equal or lower rank and never a higher one', () => {
    const g = position([['b8', 'wolf', WHITE], ['b9', 'dog', BLACK], ['a8', 'wolf', BLACK], ['c8', 'leopard', BLACK]])
    expect(capturesFrom(g, 'b8')).toEqual(['a8', 'b9'])
  })

  it('lets the Rat kill the Elephant and never the Elephant the Rat', () => {
    const rat = position([['d5', 'rat', WHITE], ['d6', 'elephant', BLACK]])
    expect(capturesFrom(rat, 'd5')).toEqual(['d6'])
    const elephant = position([['d5', 'elephant', WHITE], ['d6', 'rat', BLACK]])
    expect(capturesFrom(elephant, 'd5')).toEqual([])
  })

  it('stops a capture across the water line in either direction', () => {
    // A swimming Rat cannot kill an Elephant on the bank...
    const fromWater = position([['b4', 'rat', WHITE], ['a4', 'elephant', BLACK]])
    expect(capturesFrom(fromWater, 'b4')).toEqual([])
    // ...nor a Rat on land one in the water; Rats in the water fight.
    const fromLand = position([['a4', 'rat', WHITE], ['b4', 'rat', BLACK]])
    expect(capturesFrom(fromLand, 'a4')).toEqual([])
    const bothWet = position([['b4', 'rat', WHITE], ['b5', 'rat', BLACK]])
    expect(capturesFrom(bothWet, 'b4')).toEqual(['b5'])
  })
})

describe('traps and dens', () => {
  it('reduces a piece in an opponent trap to rank 0, whoever attacks it', () => {
    // White's traps are c1, e1 and d2. A Black Elephant on d2 falls to a Cat,
    // and a Black Rat there to the Elephant it could otherwise ignore.
    const cat = position([['d3', 'cat', WHITE], ['d2', 'elephant', BLACK]])
    expect(capturesFrom(cat, 'd3')).toEqual(['d2'])
    const elephant = position([['d3', 'elephant', WHITE], ['d2', 'rat', BLACK]])
    expect(capturesFrom(elephant, 'd3')).toEqual(['d2'])
  })

  it('leaves a piece in its own trap its full rank', () => {
    const g = position([['d3', 'cat', BLACK], ['d2', 'elephant', WHITE]], BLACK)
    expect(capturesFrom(g, 'd3')).toEqual([])
  })

  it('never lets a piece into its own den', () => {
    const g = position([['d2', 'dog', WHITE], ['g9', 'cat', BLACK]])
    expect(targetsFrom(g, 'd2')).not.toContain('d1')
  })

  it('wins the moment any animal enters the opponent den', () => {
    const g = position([['d8', 'rat', WHITE], ['a1', 'cat', BLACK]])
    g.applyMove({ from: at('d8'), to: at('d9') })
    expect(g.checkWin()).toBe(WHITE)
  })

  it('loses a side with no animal left to move', () => {
    const g = position([['d5', 'lion', WHITE], ['d6', 'cat', BLACK]])
    g.applyMove({ from: at('d5'), to: at('d6'), capture: true })
    expect(g.checkWin()).toBe(WHITE)
  })
})
