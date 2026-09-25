import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

// engine#26. Yalta Chess, three players on the trisected hexagon, from
// chessvariants.com/multiplayer.dir/yalta.html (Daniel Lindström; page by
// David Howe):
//
//   "The moves are the same as for orthodox chess, except: The pawns, bishops
//   and queens have a choice of path when they are passing the center (the
//   pawns just if they are capturing)."
//
//   "When a player is checkmated ... The player who delivered the checkmate
//   takes control of all the checkmated player's remaining pieces."
//
//   "The player to their left may attempt to help them by interposing a piece
//   or capturing the checker on that player's own turn."
//
//   "If a player in check is simultaneously checked by two opponents, the
//   check delivered first takes priority."
//
// The definition is written inline, as the variant's frontmatter will carry
// it, so these hold whatever the corpus currently says about Yalta.

const SEATS = ['r', 'g', 'b']
const half = (c) => `8/8/${`[${c}P]`.repeat(8)}/[${c}R][${c}N][${c}B][${c}Q][${c}K][${c}B][${c}N][${c}R]`
const symbols = (letter) => Object.fromEntries(SEATS.map((c, seat) => [seat, c + letter]))
const vocabulary = {
  king: { symbols: symbols('K') },
  queen: { symbols: symbols('Q') },
  rook: { symbols: symbols('R') },
  bishop: { symbols: symbols('B') },
  knight: { symbols: symbols('N') },
  pawn: { symbols: symbols('P') },
}

function yalta() {
  return createGameForFamily('chess', {
    rngSeed: 1,
    definition: {
      title: 'Yalta Chess',
      slug: 'yalta-chess',
      parent: 'chess',
      engine: {
        players: ['red', 'green', 'blue'],
        topology: { type: 'hexagonal-trisection' },
        plugins: { chess: { setup: SEATS.map(half).join('/'), vocabulary, matedArmy: 'mater' } },
      },
    },
  })
}

describe('yalta chess on the trisected hexagon', () => {
  let game
  beforeEach(() => { game = yalta() })

  const state = () => game.getState()
  const legal = () => game.getLegalMoves()
  const targets = (from) => legal().filter(m => m.from === from).map(m => m.to).sort()
  const play = (from, to, extra = {}) => {
    const move = legal().find(m => m.from === from && m.to === to && Object.entries(extra).every(([k, v]) => m[k] === v))
    if (!move) throw new Error(`no legal move ${from}-${to}`)
    return game.applyMove(move)
  }

  const NO_CASTLING = { 0: { king: false, queen: false }, 1: { king: false, queen: false }, 2: { king: false, queen: false } }
  function position(pieces, toMove, extra = {}) {
    const board = {}
    for (const key of game.topology.getAllCells()) board[key] = null
    for (const [at, type, owner, more] of pieces) board[at] = { type, owner, ...(more || {}) }
    game.loadState({
      slice: { ...state().slice, board, castlingRights: NO_CASTLING, enPassantTarget: null, enPassantPawn: null, _checkedBy: {}, _stalemate: null, ...extra },
      players: { currentIndex: toMove, eliminated: [] },
    })
  }
  const KINGS = [['Ae1', 'king', 0], ['Be1', 'king', 1], ['Ce1', 'king', 2]]

  test('starts as three chess halves: twenty moves each, taken in turn', () => {
    const order = []
    for (let i = 0; i < 6; i++) {
      order.push(state().players.currentIndex)
      expect(legal().length).toBe(20)
      play(...{ 0: ['Ae2', 'Ae4'], 1: ['Be2', 'Be4'], 2: ['Ce2', 'Ce4'] }[i % 3] || [])
      if (i >= 2) break
    }
    expect(order).toEqual([0, 1, 2])
  })

  test('sets the queen to the left of the king on every back rank', () => {
    const board = state().slice.board
    for (const [seat, s] of ['A', 'B', 'C'].entries()) {
      expect(board[`${s}d1`]).toEqual({ type: 'queen', owner: seat })
      expect(board[`${s}e1`]).toEqual({ type: 'king', owner: seat })
    }
  })

  test('a bishop passing the centre may take either path', () => {
    position([...KINGS, ['Ac3', 'bishop', 0]], 0)
    const to = targets('Ac3')
    // Both branches beyond the centre, to the far corner of each.
    for (const cell of ['Ad4', 'Bd4', 'Bc3', 'Bb2', 'Ba1', 'Cd4', 'Cc3', 'Cb2', 'Ca1']) expect(to).toContain(cell)
  })

  test('a rook passing the centre has no choice: its file runs straight on', () => {
    position([...KINGS, ['Ad2', 'rook', 0]], 0)
    const to = targets('Ad2')
    expect(to).toEqual(expect.arrayContaining(['Ad3', 'Ad4', 'Ce4', 'Ce3', 'Ce2']))
    expect(to).not.toContain('Bd4')
    expect(to).not.toContain('Cd4')
  })

  test('a pawn at the centre may capture down either path, and only when capturing', () => {
    position([...KINGS, ['Ad4', 'pawn', 0], ['Bd4', 'knight', 1], ['Cd4', 'knight', 2]], 0)
    expect(targets('Ad4')).toEqual(['Bd4', 'Cd4', 'Ce4'])
    position([...KINGS, ['Ad4', 'pawn', 0]], 0)
    expect(targets('Ad4')).toEqual(['Ce4'])
  })

  test('a pawn that has crossed runs on toward the far back rank and promotes there', () => {
    position([...KINGS, ['Bb2', 'pawn', 0]], 0)
    const moves = legal().filter(m => m.from === 'Bb2')
    expect(moves.map(m => m.to)).toEqual(['Bb1', 'Bb1', 'Bb1', 'Bb1'])
    expect(moves.map(m => m.promotion).sort()).toEqual(['bishop', 'knight', 'queen', 'rook'])
  })

  test('castles on either wing of its own back rank', () => {
    position([['Ae1', 'king', 0], ['Aa1', 'rook', 0], ['Ah1', 'rook', 0], ['Be1', 'king', 1], ['Ce1', 'king', 2]], 0,
      { castlingRights: { ...NO_CASTLING, 0: { king: true, queen: true } } })
    const castles = legal().filter(m => m.castle).map(m => [m.to, m.rookFrom, m.rookTo])
    expect(castles.sort()).toEqual([['Ac1', 'Aa1', 'Ad1'], ['Ag1', 'Ah1', 'Af1']])
    play('Ae1', 'Ag1', { castle: true })
    const board = state().slice.board
    expect(board.Ag1).toEqual({ type: 'king', owner: 0 })
    expect(board.Af1).toEqual({ type: 'rook', owner: 0 })
  })

  test('may not castle through a square another player attacks', () => {
    position([['Ae1', 'king', 0], ['Ah1', 'rook', 0], ['Be1', 'king', 1], ['Ce1', 'king', 2], ['Af4', 'rook', 2]], 0,
      { castlingRights: { ...NO_CASTLING, 0: { king: true, queen: false } } })
    expect(legal().filter(m => m.castle)).toEqual([])
  })

  test('a rook that moves gives up castling on its side', () => {
    position([['Ae1', 'king', 0], ['Ah1', 'rook', 0], ['Be1', 'king', 1], ['Ce1', 'king', 2]], 0,
      { castlingRights: { ...NO_CASTLING, 0: { king: true, queen: false } } })
    play('Ah1', 'Ah2')
    expect(state().slice.castlingRights[0].king).toBe(false)
  })

  test('a double step can be taken en passant by the next player', () => {
    position([...KINGS, ['Ae2', 'pawn', 0], ['Ad4', 'pawn', 1]], 0)
    play('Ae2', 'Ae4')
    const ep = legal().find(m => m.enPassant)
    expect(ep).toMatchObject({ from: 'Ad4', to: 'Ae3', captured: 'Ae4' })
  })

  test('checkmate hands the whole army to the player who gave it', () => {
    // Green's King is shut in its corner by its own pawns; Red's rook closes
    // the back rank. Green is next to play and cannot.
    position([...KINGS.filter(k => k[2] !== 1), ['Ba1', 'king', 1], ['Ba2', 'pawn', 1], ['Bb2', 'pawn', 1], ['Bf5', 'rook', 1], ['Bh3', 'rook', 0]], 0)
    const result = play('Bh3', 'Bh1')
    expect(result.winner).toBeNull()
    const s = state()
    expect(s.players.eliminated).toEqual([1])
    expect(s.players.currentIndex).toBe(2)
    expect(s.slice.board.Ba1).toBeNull()
    expect(s.slice.board.Ba2).toEqual({ type: 'pawn', owner: 0, origin: 1 })
  })

  test('a pawn taken over keeps running the way it always did', () => {
    position([...KINGS, ['Bb2', 'pawn', 0, { origin: 1 }]], 0)
    // Green's pawn, now Red's: it still advances up Green's files toward the
    // centre, with its double step from its own start rank.
    expect(targets('Bb2')).toEqual(['Bb3', 'Bb4'])
  })

  test('a mate the next player could still undo is not a mate yet', () => {
    // Red closes Blue's back rank, but Green moves between them and its
    // bishop can take the rook. Blue is not mated on Red's move.
    const trap = [['Ae1', 'king', 0], ['Be1', 'king', 1], ['Ca1', 'king', 2], ['Ca2', 'pawn', 2], ['Cb2', 'pawn', 2], ['Ch3', 'rook', 0], ['Cf3', 'bishop', 1]]
    position(trap, 0)
    play('Ch3', 'Ch1')
    expect(state().players.eliminated).toEqual([])
    expect(state().players.currentIndex).toBe(1)
    play('Cf3', 'Ch1')
    expect(state().players.eliminated).toEqual([])
    expect(state().players.currentIndex).toBe(2)
  })

  test('and if the next player does not help, the mate falls to whoever gave the check', () => {
    const trap = [['Ae1', 'king', 0], ['Be1', 'king', 1], ['Ca1', 'king', 2], ['Ca2', 'pawn', 2], ['Cb2', 'pawn', 2], ['Ch3', 'rook', 0], ['Bh4', 'rook', 1]]
    position(trap, 0)
    play('Ch3', 'Ch1')
    play('Bh4', 'Bh3')
    const s = state()
    expect(s.players.eliminated).toEqual([2])
    // Red gave the check, so Red takes Blue's army, although Green moved last.
    expect(s.slice.board.Cb2).toEqual({ type: 'pawn', owner: 0, origin: 2 })
    expect(s.players.currentIndex).toBe(0)
  })

  test('the last King on the board wins', () => {
    position([['Ae1', 'king', 0], ['Ba1', 'king', 1], ['Ba2', 'pawn', 1], ['Bb2', 'pawn', 1], ['Bh3', 'rook', 0], ['Ce1', 'king', 2]], 0)
    game.loadState({ players: { currentIndex: 0, eliminated: [2] } })
    const board = { ...state().slice.board, Ce1: null }
    game.loadState({ slice: { ...state().slice, board } })
    const result = play('Bh3', 'Bh1')
    expect(result.winner).toBe(0)
  })

  test('a player with no move who is not in check ends the game drawn', () => {
    // Green has only its King, in the corner. Red's rooks cover every square
    // round it and not the one it stands on.
    position([['Ae1', 'king', 0], ['Ba1', 'king', 1], ['Ce1', 'king', 2], ['Bb4', 'rook', 0], ['Bh3', 'rook', 0]], 0)
    const result = play('Bh3', 'Bh2')
    expect(result.winner).toBe('draw')
  })

  test('a King left where it can be taken is taken, and its army goes with it', () => {
    // Blue has uncovered Red's bishop on Green's King, and Red moves before
    // Green does.
    position([...KINGS.filter(k => k[2] !== 1), ['Bd2', 'king', 1], ['Bb2', 'knight', 1], ['Bc3', 'bishop', 0]], 0)
    play('Bc3', 'Bd2')
    const s = state()
    expect(s.players.eliminated).toEqual([1])
    expect(s.slice.board.Bb2).toEqual({ type: 'knight', owner: 0, origin: 1 })
  })
})
