import { createShogiPlugin } from '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#160. Wa Shogi was recorded as blocked on content - "every piece's
// movement exists only as an image" - and that was wrong. The Wikipedia article
// gives each piece's movement as prose AND a parenthesised Betza string, and
// the table in the variant file agrees with all seventeen of them.
//
// These assert against what the SOURCE says a piece does, not against what the
// compiler happens to produce, which is the only way the numbers mean anything.

const COLS = 11
const ROWS = 11
const square = (i) => `${String.fromCharCode(97 + (i % COLS))}${ROWS - Math.floor(i / COLS)}`

let game
beforeAll(async () => { game = await createGameForFamily('shogi', { variant: 'wa-shogi' }) })

const board = () => game.getState().slice.board
const find = (type, owner = 0) => board().findIndex(c => c && c.type === type && c.owner === owner)
const destinations = (from) => game.getLegalMoves().filter(m => m.from === from).map(m => square(m.to)).sort()

test('the board is 11x11 with 27 pieces a side', () => {
  const b = board()
  expect(b).toHaveLength(121)
  expect(b.filter(c => c && c.owner === 0)).toHaveLength(27)
  expect(b.filter(c => c && c.owner === 1)).toHaveLength(27)
})

test('the oxcart slides forward only, and no further than its own pawn', () => {
  // "The oxcart can move any number of squares straight forward." (fR)
  const from = find('oxcart')
  expect(square(from)).toBe('a1')
  expect(destinations(from)).toEqual(['a2'])
})

test('the sparrow pawn steps one square forward', () => {
  // "(fW)"
  const from = board().findIndex((c, i) => c && c.owner === 0 && c.type === 'sparrow_pawn' && square(i) === 'd4')
  expect(destinations(from)).toEqual(['d5'])
})

test('the crane king steps one square in any direction', () => {
  // "The crane king can step one square in any direction, orthogonal or
  // diagonal. (K)" - e1, f2 and g1 hold its own pieces at the start.
  const from = find('crane_king')
  expect(square(from)).toBe('f1')
  expect(destinations(from)).toEqual(['e2', 'g2'])
})

test('a promoted liberated horse is a vertical knight, not a knight', () => {
  // "(fbN)" in the source, vN here. Judging a knight's direction by the sign of
  // its row alone would call (-1,-2) forward too, and this piece would come out
  // with all eight knight jumps.
  const plugin = createShogiPlugin({
    rows: ROWS, cols: COLS, drops: false, promotionZone: 3, royalType: 'crane_king',
    pieceMoves: { heavenly_horse: { betza: 'vN' }, crane_king: { betza: 'K' } },
  })
  plugin.init({}, { request: () => null })

  const board = new Array(121).fill(null)
  const centre = 5 * COLS + 5                       // f6, four clear ranks each way
  board[centre] = { type: 'heavenly_horse', owner: 0 }
  board[0] = { type: 'crane_king', owner: 0 }
  board[120] = { type: 'crane_king', owner: 1 }
  const slice = { board, hands: [[], []], _cols: COLS }

  const reached = plugin.getLegalMoves(slice, { __players: { currentIndex: 0 } })
    .filter(m => m.from === centre)
    .map(m => square(m.to))
    .sort()

  expect(reached).toEqual(['e4', 'e8', 'g4', 'g8'])
})

test('it plays a full game without throwing', () => {
  let plies = 0
  for (; plies < 120; plies++) {
    const moves = game.getLegalMoves()
    if (!moves.length) break
    game.applyMove(moves[plies % moves.length])
  }
  expect(plies).toBeGreaterThan(50)
})
