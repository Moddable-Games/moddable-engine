import { createShogiPlugin } from '../index.js'

// engine#160. Tenjiku Shogi: 16x16, 78 pieces a side across 44 types. Its
// movement table was already transcribed into the variant file and agrees with
// Wikipedia's, so what it needed was three mechanics the plugin did not have.
//
// The notations here are the source's own. Ranking, from
// https://en.wikipedia.org/w/index.php?title=Tenjiku_shogi&action=raw:
//
//   "A few powerful pieces may jump over any number of pieces (including
//    zero), friend or foe ... but only when making a capture ... However, they
//    may only jump over other pieces of lower rank, whether friend or foe.
//    None may jump a king or prince."

const N = 16
const at = (r, c) => r * N + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const RANKS = { king: 1, prince: 1, great_general: 2, vice_general: 3, rook_general: 4, bishop_general: 4 }

const CONFIG = {
  rows: N, cols: N, drops: false, promotionZone: 5, royalType: 'king',
  pieceRanks: RANKS,
  burn: { type: 'fire_demon' },
  pieceMoves: {
    king: { betza: 'K' },
    pawn: { betza: 'fW' },
    rook: { betza: 'R' },
    rook_general: { betza: 'RcppR' },
    great_general: { betza: 'QcppQ' },
    vice_general: { betza: 'BcppB[mKa3K]' },
    fire_demon: { betza: 'BrlR[mKa3K]xK' },
  },
}

function position(cells, config = CONFIG) {
  const plugin = createShogiPlugin(config)
  plugin.init({}, { request })
  const board = new Array(N * N).fill(null)
  for (const [i, piece] of Object.entries(cells)) board[i] = piece
  return { plugin, slice: { board, hands: [[], []], _cols: N } }
}
const piece = (type, owner = 0) => ({ type, owner })
// Off the long diagonal: a fire demon slides as a bishop, and a king sitting
// on that ray is in check, which makes every unrelated move illegal.
const kings = { [at(0, 1)]: piece('king'), [at(15, 0)]: piece('king', 1) }

describe('range jumping generals', () => {
  it('jumps a lower-ranking piece to capture beyond it', () => {
    // A rook general outranks a pawn, so the pawn is no shield.
    const { plugin, slice } = position({
      ...kings,
      [at(8, 2)]: piece('rook_general'),
      [at(8, 4)]: piece('pawn', 1),
      [at(8, 6)]: piece('rook', 1),
    })
    const moves = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === at(8, 2))
    expect(moves.some(m => m.to === at(8, 6))).toBe(true)
  })

  it('will not jump a piece it does not outrank', () => {
    // "bishop and rook generals cannot jump over any other range-jumping
    // piece": a great general outranks a rook general.
    const { plugin, slice } = position({
      ...kings,
      [at(8, 2)]: piece('rook_general'),
      [at(8, 4)]: piece('great_general', 1),
      [at(8, 6)]: piece('rook', 1),
    })
    const moves = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === at(8, 2))
    expect(moves.some(m => m.to === at(8, 6))).toBe(false)
    // "though a rook general cannot jump over an enemy great general, it may
    // still capture the great general."
    expect(moves.some(m => m.to === at(8, 4))).toBe(true)
  })

  it('jumps nothing at all to reach an empty square', () => {
    // The jump exists "only when making a capture", so the quiet move is the
    // ordinary slide and stops at the blocker.
    const { plugin, slice } = position({
      ...kings,
      [at(8, 2)]: piece('great_general'),
      [at(8, 4)]: piece('pawn', 1),
    })
    const moves = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === at(8, 2))
    expect(moves.some(m => m.to === at(8, 4))).toBe(true)     // takes it
    expect(moves.some(m => m.to === at(8, 5))).toBe(false)    // does not pass it for nothing
  })

  it('never jumps a king, whatever its own rank', () => {
    const { plugin, slice } = position({
      [at(0, 1)]: piece('king'),
      [at(8, 2)]: piece('great_general'),
      [at(8, 4)]: piece('king', 1),
      [at(8, 6)]: piece('rook', 1),
    })
    const moves = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === at(8, 2))
    expect(moves.some(m => m.to === at(8, 6))).toBe(false)
  })
})

describe('the fire demon burns', () => {
  it('removes every adjacent enemy where it stops, and the piece it took', () => {
    // "a fire demon can capture up to eight pieces per turn (one it displaces,
    // and seven it burns on adjacent squares)."
    const cells = { ...kings }
    for (const [dr, dc] of [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
      cells[at(9 + dr, 9 + dc)] = piece('pawn', 1)
    }
    cells[at(9, 9)] = piece('rook', 1)   // the one it displaces
    cells[at(8, 8)] = piece('fire_demon') // last, so no neighbour overwrites it
    const { plugin, slice } = position(cells)

    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(8, 8) && m.to === at(9, 9))
    expect(move).toBeDefined()
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board.filter(c => c && c.owner === 1 && c.type !== 'king')).toHaveLength(0)
  })

  it('burns a piece that stops beside it, on the other player\'s move', () => {
    // "Any piece stopping next to an opposing fire demon is removed from the
    // board." The same sweep does both.
    const { plugin, slice } = position({
      ...kings,
      [at(8, 8)]: piece('fire_demon'),
      [at(6, 9)]: piece('pawn', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(1)).find(m => m.from === at(6, 9) && m.to === at(7, 9))
    expect(move).toBeDefined()
    const after = plugin.applyMove(move, slice, turn(1))
    expect(after.board[at(7, 9)]).toBeNull()
    expect(after.board[at(8, 8)]).toEqual(piece('fire_demon'))
  })

  it('does not burn another fire demon', () => {
    const { plugin, slice } = position({
      ...kings,
      [at(8, 8)]: piece('fire_demon'),
      [at(6, 8)]: piece('fire_demon', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(1)).find(m => m.from === at(6, 8) && m.to === at(7, 8))
    expect(move).toBeDefined()
    const after = plugin.applyMove(move, slice, turn(1))
    expect(after.board[at(7, 8)]).toEqual(piece('fire_demon', 1))
  })

  it('does not burn its own side', () => {
    const { plugin, slice } = position({
      ...kings,
      [at(8, 8)]: piece('fire_demon'),
      [at(9, 9)]: piece('pawn'),
    })
    // Player 0 advances up the board, so this pawn steps to (8,9), which is
    // adjacent to its own demon.
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(9, 9) && m.to === at(8, 9))
    expect(move).toBeDefined()
    expect(plugin.applyMove(move, slice, turn(0)).board[at(8, 9)]).toEqual(piece('pawn'))
  })
})

describe('the whole variant', () => {
  it('plays from its own frontmatter', async () => {
    await import('../../../play/test-helpers/setup-rules-reader.js')
    const { createGameForFamily } = await import('../../../play/src/play.js')
    const game = await createGameForFamily('shogi', { variant: 'tenjiku-shogi' })

    const board = game.getState().slice.board
    expect(board).toHaveLength(256)
    expect(board.filter(c => c && c.owner === 0)).toHaveLength(78)
    expect(board.filter(c => c && c.owner === 1)).toHaveLength(78)

    let plies = 0
    for (; plies < 40; plies++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[plies % moves.length])
    }
    expect(plies).toBe(40)
  })
})
