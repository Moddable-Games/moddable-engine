import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { registerVariant } from '../../../play/src/variant-registry.js'

// Dragon Chess (engine#182). "Each player holds two Dragon pieces in reserve
// and may gate one onto any empty square on their own first rank", and "If a
// Dragon on the board is captured, it is gone permanently."
//
// It carried its own drop action, judged by the general check filter as a piece
// moving from `undefined`: the Dragon was never on the board when check was
// tested, so a gate that blocks check was refused. And because the variant also
// declared crazyhouse's `drops`, captures went into the hand, and the module
// dropped a Dragon whenever the hand held anything - one captured pawn was an
// endless supply of Dragons.

const sq = (n) => (8 - Number(n[1])) * 8 + n.charCodeAt(0) - 97
const name = (i) => String.fromCharCode(97 + (i % 8)) + (8 - ((i / 8) | 0))

describe('Dragon Chess gating', () => {
  let game
  const drops = () => game.getLegalMoves().filter(m => m.action === 'drop')
  const load = (pieces, hands, currentIndex = 0) => {
    const cells = new Array(64).fill(null)
    for (const [at, type, owner] of pieces) cells[sq(at)] = { type, owner }
    const s = game.getState()
    game.loadState({ slice: { ...s.slice, board: cells, hands, castlingRights: null }, players: { currentIndex } })
  }

  beforeEach(async () => {
    game = await createGameForFamily('chess', { variant: 'dragon-chess', rngSeed: 1 })
  })

  test('each player starts with two Dragons in reserve', () => {
    expect(game.getState().slice.hands).toEqual([['dragon', 'dragon'], ['dragon', 'dragon']])
  })

  test('a Dragon enters only on an empty square of its own first rank', () => {
    load([['e1', 'king', 0], ['e8', 'king', 1]], [['dragon'], ['dragon']])
    expect(drops().map(m => name(m.to)).sort()).toEqual(['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1'])
    load([['e1', 'king', 0], ['e8', 'king', 1]], [['dragon'], ['dragon']], 1)
    expect(drops().map(m => name(m.to)).sort()).toEqual(['a8', 'b8', 'c8', 'd8', 'f8', 'g8', 'h8'])
  })

  test('a player in check may gate only onto a square that blocks it', () => {
    load([['e1', 'king', 0], ['e8', 'king', 1], ['a1', 'rook', 1]], [['dragon', 'dragon'], []])
    expect(drops().map(m => name(m.to)).sort()).toEqual(['b1', 'c1', 'd1'])
  })

  test('judging a gate leaves no stray key on the board', () => {
    load([['e1', 'king', 0], ['e8', 'king', 1], ['a1', 'rook', 1]], [['dragon'], []])
    drops()
    expect(Object.keys(game.getState().slice.board).filter(k => isNaN(Number(k)))).toEqual([])
  })

  test('captures never feed the reserve, and an empty reserve gates nothing', () => {
    load([['e1', 'king', 0], ['e8', 'king', 1], ['d2', 'rook', 0], ['d7', 'pawn', 1]], [[], []])
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('d2') && m.to === sq('d7')))
    expect(game.getState().slice.hands).toEqual([[], []])
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('e8') && m.to === sq('f8')))
    expect(drops()).toEqual([])
  })

  test('gating spends the Dragon from the hand', () => {
    load([['e1', 'king', 0], ['e8', 'king', 1]], [['dragon', 'dragon'], []])
    game.applyMove(drops().find(m => m.to === sq('b1')))
    expect(game.getState().slice.hands[0]).toEqual(['dragon'])
    expect(game.getState().slice.board[sq('b1')]).toMatchObject({ type: 'dragon', owner: 0 })
  })
})

// The general check filter is what any variant module's own action goes
// through unless it opts out. One that enters a piece from off the board has no
// `from`, and must be judged with the piece on the board.
describe('a module action that enters a piece from off the board', () => {
  test('is judged with the entering piece on the board', async () => {
    registerVariant('chess', 'test-entering-action', {
      actions: {
        enter: {
          generate: (slice) => [sq('b1'), sq('h2')]
            .filter(to => slice.board[to] === null)
            .map(to => ({ action: 'enter', type: 'rook', to })),
          apply: (move, { board, playerIdx }) => {
            board[move.to] = { type: move.type, owner: playerIdx }
            return { board }
          },
        },
      },
    })
    const game = await createGameForFamily('chess', { variant: 'test-entering-action', rngSeed: 1 })
    const cells = new Array(64).fill(null)
    cells[sq('e1')] = { type: 'king', owner: 0 }
    cells[sq('e8')] = { type: 'king', owner: 1 }
    cells[sq('a1')] = { type: 'rook', owner: 1 }
    const s = game.getState()
    game.loadState({ slice: { ...s.slice, board: cells, castlingRights: null }, players: { currentIndex: 0 } })
    const entries = game.getLegalMoves().filter(m => m.action === 'enter').map(m => name(m.to))
    expect(entries).toEqual(['b1'])
    expect(Object.keys(game.getState().slice.board).filter(k => isNaN(Number(k)))).toEqual([])
  })
})
