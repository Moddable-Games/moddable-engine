import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#179. Stupidhouse, from chessvariants.com/multiplayer.dir/
// stupidhouse.html (Bodlaender, after John Beasley, Variant Chess 1999):
//
//   "The players of a team have pieces of the same color. When a player takes
//   a piece of his opponent, he gives the piece to his partner, that must place
//   the piece on the board instead of making a normal move."
//
// So a capture forces the partner to put an ENEMY piece on their own board.
// The rulebook had described a random square instead, which no source says.

const PLANE = 64
const sq = (name, board = 'A') => (board === 'B' ? PLANE : 0) + (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97

describe('stupidhouse', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'stupidhouse', rngSeed: 1 }) })
  const state = () => game.getState()

  function position(pieces, toMove, extra = {}) {
    const cells = new Array(2 * PLANE).fill(null)
    cells[sq('e1', 'A')] = { type: 'king', owner: 0 }
    cells[sq('e8', 'A')] = { type: 'king', owner: 1 }
    cells[sq('e1', 'B')] = { type: 'king', owner: 2 }
    cells[sq('e8', 'B')] = { type: 'king', owner: 3 }
    for (const [at, b, type, owner] of pieces) cells[sq(at, b)] = { type, owner }
    const s = state()
    game.loadState({
      slice: { ...s.slice, board: cells, castlingRights: null, hands: [[], [], [], []], boardResults: {}, enPassantBoards: {}, ...extra },
      players: { currentIndex: toMove, orderStep: 1 },
    })
  }

  test('a capture goes to the partner of the same colour', () => {
    // White A (0) and White B (2) are partners.
    position([['d2', 'A', 'rook', 0], ['d7', 'A', 'knight', 1]], 0)
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('d2') && m.to === sq('d7')))
    expect(state().slice.hands[2]).toEqual(['knight'])
  })

  test('the partner must place it, and it goes down as the enemy piece it is', () => {
    position([['a2', 'B', 'pawn', 2]], 2, { hands: [[], [], ['knight'], []] })
    const moves = game.getLegalMoves()
    // "must place the piece on the board instead of making a normal move"
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.action === 'drop' && m.to >= PLANE)).toBe(true)

    game.applyMove(moves.find(m => m.to === sq('a5', 'B')))
    // A Black knight, on White B's board: it belongs to Black B.
    expect(state().slice.board[sq('a5', 'B')]).toEqual({ type: 'knight', owner: 3 })
    expect(state().slice.hands[2]).toEqual([])
  })

  test('an enemy piece may not be placed where it checks the placer', () => {
    position([], 2, { hands: [[], [], ['knight'], []] })
    const checking = [sq('d3', 'B'), sq('f3', 'B'), sq('c2', 'B'), sq('g2', 'B')]
    const drops = game.getLegalMoves()
    expect(drops.some(m => checking.includes(m.to))).toBe(false)
  })

  test('with nothing in hand, play is ordinary', () => {
    position([['a2', 'B', 'pawn', 2]], 2)
    expect(game.getLegalMoves().some(m => m.action === 'drop')).toBe(false)
    expect(game.getLegalMoves().some(m => m.from === sq('a2', 'B'))).toBe(true)
  })

  test('the first checkmate decides the match', () => {
    // Played at a Double Bughouse tournament: the first mate ends it.
    position([['a7', 'A', 'rook', 0], ['b1', 'A', 'rook', 0]], 0)
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('b1') && m.to === sq('b8')))
    expect(game.checkWin()).toEqual({ team: [0, 2], score: [1, 0] })
  })

  test('it keeps playing with compulsory placements', () => {
    let placed = 0
    for (let i = 0; i < 120; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const captures = moves.filter(m => m.capture)
      const move = moves[0].action === 'drop' ? moves[(i * 7) % moves.length] : captures.length ? captures[0] : moves[(i * 13) % moves.length]
      if (move.action === 'drop') placed++
      game.applyMove(move)
      if (game.checkWin()) break
    }
    expect(placed).toBeGreaterThan(0)
  })
})
