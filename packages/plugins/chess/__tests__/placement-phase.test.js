// `placementPieces` set a phase and a list of pieces at init and was read by
// nothing else: both variants that declare it opened straight into ordinary
// play with the phase still flagged and the pieces never placed. These tests
// cover the phase end to end, because a feature whose only evidence is a field
// on the initial state is a feature that can quietly stop working.
import { createChessPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGridTopology } from '../../../topologies/grid/index.js'
import { createRng } from '../../../core/index.js'

const COLS = 8
const fileOf = (i) => 'abcdefgh'[i % COLS]
const rankOf = (i) => 8 - Math.trunc(i / COLS)
const square = (i) => `${fileOf(i)}${rankOf(i)}`
const colorOf = (i) => (Math.trunc(i / COLS) + (i % COLS)) % 2

function createGame(variantConfig) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: {} },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin({ ...cfg, ...variantConfig }, ctx) },
    }
  )
}

const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

const PLACEMENT_CHESS = {
  setup: '8/pppppppp/8/8/8/8/PPPPPPPP/8',
  placementPieces: [BACK_RANK, BACK_RANK],
  placementDistinctColor: ['bishop'],
}

// a3 b3 c3 d3 e4 f4 g4 h4 for white, mirrored for black - the staggered pawn
// formation sittuyin starts from, not a straight rank.
const SITTUYIN = {
  setup: '8/8/4pppp/pppp4/4PPPP/PPPP4/8/8',
  castling: false,
  enPassant: false,
  doubleStep: false,
  placementPieces: [
    ['rook', 'rook', 'knight', 'knight', 'khon', 'khon', 'ferz', 'king'],
    ['rook', 'rook', 'knight', 'knight', 'khon', 'khon', 'ferz', 'king'],
  ],
  placementZone: { default: [0, 1, 2], rook: [0] },
  pieces: {
    ferz: { type: 'leaper', offsets: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
    khon: { type: 'leaper', offsets: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], directional: true },
  },
}

function playPlacement(game, pick) {
  let plies = 0
  while (game.getState('chess').phase === 'placement') {
    const moves = game.getLegalMoves()
    if (moves.length === 0) throw new Error(`no legal moves at placement ply ${plies}`)
    const result = game.execute(moves[pick(plies, moves.length)])
    if (result && result.ok === false) throw new Error(`placement rejected at ply ${plies}: ${result.reason}`)
    plies++
    if (plies > 64) throw new Error('placement did not finish')
  }
  return plies
}

const countPieces = (board) => board.filter(Boolean).length

describe('placement phase', () => {
  describe('placement chess', () => {
    it('opens in the placement phase with both back ranks empty', () => {
      const state = createGame(PLACEMENT_CHESS).getState('chess')
      expect(state.phase).toBe('placement')
      expect(countPieces(state.board)).toBe(16)
      expect(state._toPlace.map(list => list.length)).toEqual([8, 8])
    })

    it('offers only placements while a piece is still in hand', () => {
      const game = createGame(PLACEMENT_CHESS)
      const moves = game.getLegalMoves()
      expect(moves.length).toBeGreaterThan(0)
      expect(moves.every(m => m.action === 'place')).toBe(true)
    })

    // The bug this file exists for: `place` was not in the action registry, so
    // validateMove read `move.from`, found nothing there, and rejected every
    // placement the generator had just produced.
    it('accepts a placement it generated', () => {
      const game = createGame(PLACEMENT_CHESS)
      const move = game.getLegalMoves()[0]
      const result = game.execute(move)
      expect(result.ok).toBe(true)
      const state = game.getState('chess')
      expect(state.board[move.to]).toEqual({ type: move.type, owner: 0 })
      expect(state._toPlace[0]).toHaveLength(7)
    })

    it('finishes in sixteen plies and hands over to ordinary play', () => {
      const game = createGame(PLACEMENT_CHESS)
      const plies = playPlacement(game, (i, n) => (i * 7) % n)
      const state = game.getState('chess')
      expect(plies).toBe(16)
      expect(state.phase).toBe('play')
      expect(countPieces(state.board)).toBe(32)
      expect(state._toPlace).toEqual([[], []])
      expect(game.getLegalMoves().some(m => m.action === 'place')).toBe(false)
    })

    // Filling every square of one colour with other pieces left the second
    // bishop with nowhere legal to stand, and the player carried it into the
    // middlegame. A placement that strands a piece is not legal.
    it.each([1, 3, 5, 7, 11])('leaves both bishops on opposite colours (stride %i)', (stride) => {
      const game = createGame(PLACEMENT_CHESS)
      playPlacement(game, (i, n) => (i * stride) % n)
      const board = game.getState('chess').board
      for (const owner of [0, 1]) {
        const colors = board
          .map((cell, i) => (cell && cell.owner === owner && cell.type === 'bishop' ? colorOf(i) : null))
          .filter(c => c !== null)
        expect(colors).toHaveLength(2)
        expect(colors[0]).not.toBe(colors[1])
      }
    })
  })

  describe('sittuyin', () => {
    it('starts from the staggered pawn formation', () => {
      const board = createGame(SITTUYIN).getState('chess').board
      const squares = [[], []]
      board.forEach((cell, i) => { if (cell) squares[cell.owner].push(square(i)) })
      expect(squares[0].sort()).toEqual(['a3', 'b3', 'c3', 'd3', 'e4', 'f4', 'g4', 'h4'])
      expect(squares[1].sort()).toEqual(['a5', 'b5', 'c5', 'd5', 'e6', 'f6', 'g6', 'h6'])
    })

    it.each([1, 3, 5, 7, 11])('places every piece inside its own three ranks (stride %i)', (stride) => {
      const game = createGame(SITTUYIN)
      const plies = playPlacement(game, (i, n) => (i * stride) % n)
      expect(plies).toBe(16)
      const board = game.getState('chess').board
      expect(countPieces(board)).toBe(32)
      board.forEach((cell, i) => {
        if (!cell || cell.type === 'pawn') return
        const rank = rankOf(i)
        if (cell.owner === 0) expect(rank).toBeLessThanOrEqual(3)
        else expect(rank).toBeGreaterThanOrEqual(6)
      })
    })

    // `placementZone` narrowed for one type: sittuyin rooks are the only piece
    // bound to the back rank.
    it.each([1, 3, 5, 7, 11])('keeps both rooks on the back rank (stride %i)', (stride) => {
      const game = createGame(SITTUYIN)
      playPlacement(game, (i, n) => (i * stride) % n)
      const board = game.getState('chess').board
      const rookRanks = [[], []]
      board.forEach((cell, i) => { if (cell && cell.type === 'rook') rookRanks[cell.owner].push(rankOf(i)) })
      expect(rookRanks[0]).toEqual([1, 1])
      expect(rookRanks[1]).toEqual([8, 8])
    })
  })

  // The strided pickers above are a handful of fixed paths through a space of
  // thousands, and they all happened to miss the one that mattered: a back rank
  // filled so that the last two free squares share a colour strands both
  // bishops, and the phase never ends. Random play found it in one run in
  // thirty. Seeded so a failure names the run that produced it.
  describe.each([['placement chess', PLACEMENT_CHESS], ['sittuyin', SITTUYIN]])(
    '%s under random placement',
    (_label, variantConfig) => {
      it('finishes in sixteen plies from every one of 200 seeds', () => {
        const stranded = []
        for (let seed = 1; seed <= 200; seed++) {
          const rng = createRng(seed)
          const game = createGame(variantConfig)
          try {
            const plies = playPlacement(game, (_i, n) => Math.floor(rng.next() * n))
            if (plies !== 16) stranded.push(`seed ${seed}: ${plies} plies`)
          } catch (e) {
            stranded.push(`seed ${seed}: ${e.message}`)
          }
        }
        expect(stranded).toEqual([])
      })
    }
  )

  it('a variant that declares no placement pieces never enters the phase', () => {
    const game = createGame({})
    expect(game.getState('chess').phase).toBeUndefined()
    expect(game.getLegalMoves().every(m => m.action !== 'place')).toBe(true)
  })
})
