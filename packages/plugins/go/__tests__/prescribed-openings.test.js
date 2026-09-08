import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#162. Sunjang Baduk opens from a prescribed position of sixteen stones,
// and the board came up empty because nobody had the position: every source
// showed it only as a diagram image.
//
// The points were read out of that image programmatically - grid located from
// the board's own lines, every intersection sampled and classified - and each
// colour's eight points map onto themselves under a 180 degree rotation, which
// is what makes the opening balanced without komi and is the check that says
// the reading is right.

const COLS = 19
const LETTERS = 'ABCDEFGHJKLMNOPQRST'
const at = (point) => {
  const col = LETTERS.indexOf(point[0])
  const row = 19 - Number(point.slice(1))
  return row * COLS + col
}

const BLACK = ['D4', 'G4', 'N4', 'D10', 'Q10', 'G16', 'N16', 'Q16']
const WHITE = ['K4', 'Q4', 'D7', 'Q7', 'D13', 'Q13', 'D16', 'K16']

const openingBoard = () => createGameForFamily('go', { variant: 'sunjang' }).getState().slice.board

describe('Sunjang Baduk opens from its prescribed position (engine#162)', () => {
  it('places sixteen stones and no more', () => {
    const board = openingBoard()
    expect(board.filter(Boolean)).toHaveLength(16)
  })

  it('places eight of each colour on the recorded points', () => {
    // Go holds a stone as the colour itself rather than as a piece object, so
    // a cell reads 'black' or 'white'.
    const board = openingBoard()
    expect(new Set(board.filter(Boolean))).toEqual(new Set(['black', 'white']))
    for (const point of BLACK) expect(board[at(point)]).toBe('black')
    for (const point of WHITE) expect(board[at(point)]).toBe('white')
  })

  it('leaves the centre empty, because Black is required to play there first', () => {
    expect(openingBoard()[at('K10')]).toBeFalsy()
  })

  it('is balanced: each colour maps onto itself turned through 180 degrees', () => {
    const turn = (point) => {
      const col = LETTERS.indexOf(point[0])
      const row = Number(point.slice(1))
      return `${LETTERS[18 - col]}${20 - row}`
    }
    expect(new Set(BLACK.map(turn))).toEqual(new Set(BLACK))
    expect(new Set(WHITE.map(turn))).toEqual(new Set(WHITE))
  })
})

// engine#162. Tibetan Go's twelve stones, on a 17x17 board, read from the
// Sensei's Library page that had been recorded as unreachable. Six each,
// on the third line, and symmetric the same way Sunjang's are.
describe('Tibetan Go opens from its prescribed position (engine#162)', () => {
  const T_COLS = 17
  const T_LETTERS = 'ABCDEFGHJKLMNOPQR'
  const tAt = (point) => {
    const col = T_LETTERS.indexOf(point[0])
    const row = 17 - Number(point.slice(1))
    return row * T_COLS + col
  }
  const T_BLACK = ['C15', 'L15', 'P11', 'C7', 'G3', 'P3']
  const T_WHITE = ['G15', 'P15', 'C11', 'P7', 'C3', 'L3']
  const board = () => createGameForFamily('go', { variant: 'tibetan' }).getState().slice.board

  it('places twelve stones, six of each colour', () => {
    const b = board()
    expect(b.filter(Boolean)).toHaveLength(12)
    for (const point of T_BLACK) expect(b[tAt(point)]).toBe('black')
    for (const point of T_WHITE) expect(b[tAt(point)]).toBe('white')
  })

  it('puts them on the third line, which is not where the old record said', () => {
    // Every stone sits on line 3 or line 15, and 15 is the third line from the
    // far side of a 17x17 board. None is on the fourth line.
    for (const point of [...T_BLACK, ...T_WHITE]) {
      const col = T_LETTERS.indexOf(point[0]) + 1
      const row = Number(point.slice(1))
      const onThird = [col, 18 - col, row, 18 - row].includes(3)
      expect(onThird).toBe(true)
    }
  })

  it('is balanced under a half turn of the board', () => {
    const turn = (p) => `${T_LETTERS[16 - T_LETTERS.indexOf(p[0])]}${18 - Number(p.slice(1))}`
    expect(new Set(T_BLACK.map(turn))).toEqual(new Set(T_BLACK))
    expect(new Set(T_WHITE.map(turn))).toEqual(new Set(T_WHITE))
  })
})
