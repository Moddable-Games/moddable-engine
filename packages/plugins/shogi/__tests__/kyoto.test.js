import { createShogiPlugin } from '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { createRng } from '../../../core/index.js'

// engine#160. Kyoto Shogi has no promotion zone: "every time a piece makes a
// move it alternately promotes and reverts to its unpromoted state". The flip
// is a property of having moved, so it is applied rather than offered, and a
// piece in hand is two moves rather than one because "a captured piece may be
// dropped with either side facing up".

const COLS = 5
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const FLIP = {
  tokin: 'lance', lance: 'tokin',
  silver: 'bishop', bishop: 'silver',
  gold: 'knight', knight: 'gold',
  pawn: 'rook', rook: 'pawn',
}

const KYOTO = {
  rows: 5, cols: 5, promotionZone: 0, flipMap: FLIP,
  dropPawnFileLimit: false, noDropLastRank: [], noDropSecondRank: [],
  pieceMoves: {
    tokin: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]], directional: true },
  },
}

function position(cells, hands = [[], []]) {
  const plugin = createShogiPlugin(KYOTO)
  plugin.init({}, { request })
  const board = new Array(25).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, hands: hands.map(h => h.slice()), _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })

describe('kyoto shogi (engine#160)', () => {
  it('flips a piece to its other face when it moves', () => {
    const { plugin, slice } = position({
      [at(4, 0)]: piece('tokin'), [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(4, 0))
    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board[move.to].type).toBe('lance')
  })

  it('flips back on the next move, so the pair alternates', () => {
    const { plugin, slice } = position({
      [at(4, 0)]: piece('lance'), [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(4, 0))
    expect(plugin.applyMove(move, slice, turn(0)).board[move.to].type).toBe('tokin')
  })

  it('never flips the King', () => {
    const { plugin, slice } = position({
      [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    })
    const move = plugin.getLegalMoves(slice, turn(0)).find(m => m.from === at(4, 2))
    expect(plugin.applyMove(move, slice, turn(0)).board[move.to].type).toBe('king')
  })

  it('offers no promotion, because there is no zone to promote in', () => {
    const { plugin, slice } = position({
      [at(1, 0)]: piece('pawn'), [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    })
    expect(plugin.getLegalMoves(slice, turn(0)).some(m => m.promote)).toBe(false)
  })

  it('offers a piece in hand with either face up', () => {
    const { plugin, slice } = position({
      [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    }, [['pawn'], []])
    const drops = plugin.getLegalMoves(slice, turn(0)).filter(m => m.action === 'drop')
    expect(new Set(drops.map(m => m.type))).toEqual(new Set(['pawn', 'rook']))
  })

  it('spends the piece from hand whichever face was dropped', () => {
    const { plugin, slice } = position({
      [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    }, [['pawn'], []])
    const asRook = plugin.getLegalMoves(slice, turn(0)).find(m => m.action === 'drop' && m.type === 'rook')
    const after = plugin.applyMove(asRook, slice, turn(0))
    expect(after.hands[0]).toEqual([])
    expect(after.board[asRook.to]).toEqual({ type: 'rook', owner: 0 })
  })

  it('drops onto a file that already holds a pawn', () => {
    const { plugin, slice } = position({
      [at(3, 0)]: piece('pawn'), [at(4, 2)]: piece('king'), [at(0, 2)]: piece('king', 1),
    }, [['pawn'], []])
    const drops = plugin.getLegalMoves(slice, turn(0)).filter(m => m.action === 'drop' && m.type === 'pawn')
    expect(drops.some(m => m.to % COLS === 0)).toBe(true)
  })

  it('opens on the position the sources give, T-S-K-G-P', () => {
    const state = createGameForFamily('shogi', { variant: 'kyoto-shogi', rngSeed: 1 }).getState()
    const slice = state?.slice || state
    expect(slice.board.slice(20, 25).map(c => c && c.type))
      .toEqual(['tokin', 'silver', 'king', 'gold', 'pawn'])
    expect(slice.board.slice(0, 5).map(c => c && c.type))
      .toEqual(['pawn', 'gold', 'king', 'silver', 'tokin'])
  })

  it('creates and destroys no pieces over a whole game', () => {
    for (const seed of [1, 2, 3]) {
      const game = createGameForFamily('shogi', { variant: 'kyoto-shogi', rngSeed: seed })
      const rng = createRng(seed)
      const total = () => {
        const s = game.getState()
        const slice = s?.slice || s
        return slice.board.filter(Boolean).length + slice.hands.flat().length
      }
      expect(total()).toBe(10)
      for (let i = 0; i < 400; i++) {
        const moves = game.getLegalMoves()
        if (!moves.length) break
        const result = game.applyMove(moves[Math.floor(rng.next() * moves.length)])
        if (!result || !result.ok) break
        expect(total()).toBe(10)
        if (result.winner !== undefined && result.winner !== null) break
      }
    }
  })
})
