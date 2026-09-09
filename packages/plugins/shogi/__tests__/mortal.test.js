import { createShogiPlugin } from '../index.js'

// engine#160. Mortal Shogi replaces two of Shogi's rules at once:
//
//   "When a piece is captured, it demotes one step" down a ranking of its own -
//   dragon king, dragon horse, rook, bishop, gold, silver, lance, knight, pawn -
//   and "Pawn -> removed from the game permanently".
//
//   "The standard Shogi promoted forms for Pawn, Knight, Lance, and Silver
//   (Tokin, etc.) are not used." A pawn instead "promotes to Knight, Lance,
//   Silver General, or Gold General", so the mover chooses.
//
// Sourced from chessvariants.com, which was reached on 2026-09-08 with a
// browser User-Agent after months of 403s.

const COLS = 9
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const LADDER = {
  dragon_king: 'dragon_horse', dragon_horse: 'rook', rook: 'bishop',
  bishop: 'gold', gold: 'silver', silver: 'lance', lance: 'knight',
  knight: 'pawn', pawn: 'removed',
}

const MORTAL = {
  rows: 9, cols: 9, promotionZone: 3,
  demotionMap: LADDER,
  promotionMap: {
    pawn: ['knight', 'lance', 'silver', 'gold'],
    knight: ['lance', 'silver', 'gold'],
    lance: ['silver', 'gold'],
    silver: ['gold'],
    bishop: ['dragon_horse'],
    rook: ['dragon_king'],
  },
}

function position(cells) {
  const plugin = createShogiPlugin(MORTAL)
  plugin.init({}, { request })
  const board = new Array(81).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, hands: [[], []], _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })

describe('the capture ladder', () => {
  it('sends a captured piece to hand one rung down, not as its own type', () => {
    // A bishop is not a bishop in hand: it is a gold general.
    const { plugin, slice } = position({
      [at(4, 4)]: piece('rook'), [at(4, 6)]: piece('bishop', 1),
      [at(8, 4)]: piece('king'), [at(0, 4)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(4, 4) && m.to === at(4, 6))
    expect(move).toBeDefined()
    expect(plugin.applyMove(move, slice, turn(0)).hands[0]).toEqual(['gold'])
  })

  it('descends the ladder, never the inverse of the promotion table', () => {
    // The inverse of promotionMap would send a captured gold back to a silver,
    // a lance, a knight or a pawn depending on which entry won. The ladder says
    // silver, and says it for every gold however it got there.
    const { plugin, slice } = position({
      [at(4, 4)]: piece('rook'), [at(4, 6)]: piece('gold', 1),
      [at(8, 4)]: piece('king'), [at(0, 4)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.to === at(4, 6))
    expect(plugin.applyMove(move, slice, turn(0)).hands[0]).toEqual(['silver'])
  })

  it('removes a captured pawn from the game rather than banking it', () => {
    const { plugin, slice } = position({
      [at(4, 4)]: piece('rook'), [at(4, 6)]: piece('pawn', 1),
      [at(8, 4)]: piece('king'), [at(0, 4)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.to === at(4, 6))
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.hands[0]).toEqual([])
    expect(after.board[at(4, 6)]).toEqual({ type: 'rook', owner: 0 })
  })
})

describe('promotion to a choice of pieces', () => {
  it('offers a pawn every rank the source lists, not just the first', () => {
    const { plugin, slice } = position({
      [at(3, 4)]: piece('pawn'), [at(8, 4)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    const offered = plugin.getLegalMoves(slice, turn(0))
      .filter(m => m.from === at(3, 4) && m.promote)
      .map(m => m.promote)
      .sort()
    expect(offered).toEqual(['gold', 'knight', 'lance', 'silver'])
  })

  it('makes the piece the mover asked for', () => {
    const { plugin, slice } = position({
      [at(3, 4)]: piece('pawn'), [at(8, 4)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(3, 4) && m.promote === 'silver')
    expect(plugin.applyMove(move, slice, turn(0)).board[move.to].type).toBe('silver')
  })

  it('refuses a promotion the piece was never offered', () => {
    // Nothing generates this move; a hand-written one must not turn a pawn into
    // a king because the field happened to hold that string.
    const { plugin, slice } = position({
      [at(3, 4)]: piece('pawn'), [at(8, 4)]: piece('king'), [at(0, 0)]: piece('king', 1),
    })
    const legal = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(3, 4) && m.promote)
    const forged = { ...legal, promote: 'king' }
    expect(plugin.applyMove(forged, slice, turn(0)).board[legal.to].type).toBe('knight')
  })
})

describe('ordinary shogi is unchanged', () => {
  it('still reverts a promoted piece to its base form when no ladder is declared', () => {
    const plugin = createShogiPlugin({ rows: 9, cols: 9, promotionZone: 3 })
    plugin.init({}, { request })
    const board = new Array(81).fill(null)
    board[at(4, 4)] = piece('rook')
    board[at(4, 6)] = piece('promoted_pawn', 1)
    board[at(8, 4)] = piece('king')
    board[at(0, 4)] = piece('king', 1)
    const slice = { board, hands: [[], []], _cols: COLS }
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.to === at(4, 6))
    expect(plugin.applyMove(move, slice, turn(0)).hands[0]).toEqual(['pawn'])
  })
})
