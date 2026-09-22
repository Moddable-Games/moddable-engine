import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'
import { boardToSetup } from '../../../play/src/serialise.js'

// engine#179. Tandem Chess is two boards in one game with four seats: White A
// (0), Black A (1), White B (2), Black B (3). Partners play opposite colours on
// different boards - "For each team, one player plays with white pieces and
// the other plays with black" - so the teams are 0 + 3 and 1 + 2.
//
// Rules quoted from chessvariants.com/multiplayer.dir/tandem.html, the source
// the rulebook cites.

const PLANE = 64
const sq = (name, board = 'A') => (board === 'B' ? PLANE : 0) + (8 - Number(name[1])) * 8 + name.charCodeAt(0) - 97

describe('tandem chess', () => {
  let game
  beforeEach(async () => { game = await createGameForFamily('chess', { variant: 'tandem-chess', rngSeed: 1 }) })
  const state = () => game.getState()
  const board = () => state().slice.board

  // Two kings a side on each board, plus whatever is given, with a seat to move.
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

  test('each board belongs to its own two seats', () => {
    for (const seat of [0, 1]) expect(board().slice(0, PLANE).filter(c => c && c.owner === seat)).toHaveLength(16)
    for (const seat of [2, 3]) expect(board().slice(PLANE).filter(c => c && c.owner === seat)).toHaveLength(16)
  })

  test('seats take turns in the order the source gives for turn-based play', () => {
    // "South begins by moving a white piece. North replies by moving a black
    // piece followed by a white piece. South replies by moving a white piece
    // followed by a black piece."
    const order = []
    for (let i = 0; i < 9; i++) {
      order.push(state().players.currentIndex)
      game.applyMove(game.getLegalMoves()[0])
    }
    expect(order).toEqual([0, 1, 2, 0, 3, 1, 2, 0, 3])
  })

  test('a seat only ever moves on its own board', () => {
    for (let i = 0; i < 40; i++) {
      const seat = state().players.currentIndex
      const moves = game.getLegalMoves()
      const plane = seat < 2 ? 0 : 1
      for (const m of moves) expect(Math.floor((m.to) / PLANE)).toBe(plane)
      game.applyMove(moves[(i * 7) % moves.length])
    }
  })

  test('a captured piece goes to the partner, who drops it on the other board', () => {
    // "All captured pieces are given to ones partner."
    position([['d2', 'A', 'rook', 0], ['d7', 'A', 'knight', 1]], 0)
    const take = game.getLegalMoves().find(m => m.from === sq('d2') && m.to === sq('d7'))
    game.applyMove(take)
    expect(state().slice.hands[0]).toEqual([])
    expect(state().slice.hands[3]).toEqual(['knight'])

    game.loadState({ players: { currentIndex: 3 } })
    const drops = game.getLegalMoves().filter(m => m.action === 'drop')
    expect(drops.length).toBeGreaterThan(0)
    expect(drops.every(m => m.type === 'knight' && m.to >= PLANE)).toBe(true)
  })

  test('a drop may not give check', () => {
    // "One is not allowed to give check or mate with a dropped piece."
    position([], 0, { hands: [['knight'], [], [], []] })
    const drops = game.getLegalMoves().filter(m => m.action === 'drop')
    const checking = [sq('d6'), sq('f6'), sq('c7'), sq('g7')]
    expect(drops.length).toBeGreaterThan(40)
    expect(drops.some(m => checking.includes(m.to))).toBe(false)
  })

  test('a double step keeps its en passant chance while the other board moves', () => {
    // White B plays e2-e4 beside a Black pawn on d4; White A moves in between;
    // Black B may still take en passant.
    position([['e2', 'B', 'pawn', 2], ['d4', 'B', 'pawn', 3], ['a2', 'A', 'pawn', 0]], 2)
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('e2', 'B') && m.to === sq('e4', 'B')))
    game.loadState({ players: { currentIndex: 0 } })
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('a2', 'A')))
    game.loadState({ players: { currentIndex: 3 } })
    const ep = game.getLegalMoves().find(m => m.enPassant)
    expect(ep).toBeDefined()
    expect(ep.to).toBe(sq('e3', 'B'))
  })

  test('a finished board leaves the turn order, and the match is scored when both are done', () => {
    // "The match continues until both games are completed ... 1 for a win, 1/2
    // for a draw, and 0 for a loss."
    // Black A is mated on board A by White A's rooks.
    position([['a7', 'A', 'rook', 0], ['b1', 'A', 'rook', 0], ['h8', 'A', 'rook', 1]], 0)
    const s = state()
    const cells = s.slice.board.slice()
    cells[sq('h8')] = null
    game.loadState({ slice: { ...s.slice, board: cells } })
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('b1') && m.to === sq('b8')))
    expect(state().slice.boardResults).toEqual({ 0: 0 })
    expect(state().players.eliminated.sort()).toEqual([0, 1])
    expect(game.checkWin()).toBeNull()

    // Board B plays on between its own seats only.
    for (let i = 0; i < 6; i++) {
      expect([2, 3]).toContain(state().players.currentIndex)
      game.applyMove(game.getLegalMoves()[0])
    }
  })

  test('a board each is a drawn match', () => {
    position([], 2, { boardResults: { 0: 0 } })
    game.loadState({ players: { currentIndex: 2, eliminated: [0, 1] } })
    // White B mates Black B.
    const s = state()
    const cells = s.slice.board.slice()
    cells[sq('a7', 'B')] = { type: 'rook', owner: 2 }
    cells[sq('b1', 'B')] = { type: 'rook', owner: 2 }
    game.loadState({ slice: { ...s.slice, board: cells } })
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('b1', 'B') && m.to === sq('b8', 'B')))
    // Board A to White A (team 0 + 3), board B to White B (team 1 + 2): 1-1.
    expect(game.checkWin()).toBe('draw')
  })

  test('two boards to one side is a win for the partnership', () => {
    // White A has won board A; Black B, White A's partner, mates White B.
    position([], 3, { boardResults: { 0: 0 } })
    game.loadState({ players: { currentIndex: 3, eliminated: [0, 1] } })
    const s = state()
    const cells = s.slice.board.slice()
    cells[sq('a2', 'B')] = { type: 'rook', owner: 3 }
    cells[sq('b8', 'B')] = { type: 'rook', owner: 3 }
    game.loadState({ slice: { ...s.slice, board: cells } })
    game.applyMove(game.getLegalMoves().find(m => m.from === sq('b8', 'B') && m.to === sq('b1', 'B')))
    expect(game.checkWin()).toEqual({ team: [0, 3], score: [2, 0] })
  })

  test('each board is written as an ordinary FEN', () => {
    const topo = { rows: 8, cols: 8, layers: 2, layerSeats: [[0, 1], [2, 3]] }
    const vocabulary = {
      king: { symbols: { 0: 'K', 1: 'k' } }, queen: { symbols: { 0: 'Q', 1: 'q' } },
      rook: { symbols: { 0: 'R', 1: 'r' } }, bishop: { symbols: { 0: 'B', 1: 'b' } },
      knight: { symbols: { 0: 'N', 1: 'n' } }, pawn: { symbols: { 0: 'P', 1: 'p' } },
    }
    const fens = boardToSetup(state().slice, topo, vocabulary)
    expect(fens).toHaveLength(2)
    expect(fens[1].split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
  })

  test('it keeps playing, with drops, across both boards', () => {
    let drops = 0
    for (let i = 0; i < 120; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const dropMoves = moves.filter(m => m.action === 'drop')
      const captures = moves.filter(m => m.capture)
      const move = dropMoves.length && i % 3 === 0 ? dropMoves[0] : captures.length ? captures[0] : moves[(i * 13) % moves.length]
      if (move.action === 'drop') drops++
      game.applyMove(move)
    }
    expect(drops).toBeGreaterThan(0)
    const s = state()
    expect(s.slice.board.filter(Boolean).length).toBeGreaterThan(20)
  })
})
