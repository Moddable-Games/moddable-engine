import { createGameForVariant, loadFen, toFen } from '../../../play/src/fen.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import '../../index.js'

// Jieqi (揭棋). Every piece but the General starts face down, shuffled across
// the squares those pieces normally occupy - so the piece on a Chariot's home
// square is usually not a Chariot. Until it moves it must move AS a Chariot;
// making that move turns it face up and it moves as itself thereafter.
//
// Source: pychess.org/variants/jieqi, cited by the rulebook. "A Jieqi piece
// should do the first move as the original piece in which it is located" and
// "after the first move, it will be revealed/uncovered to show its real
// material".

const HOME = 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR'
const COLS = 9

function game(seed) {
  return createGameForVariant('xiangqi', 'jieqi', { rngSeed: seed })
}
function slice(g) {
  return g.raw.store.get('xiangqi')
}
function homeTypes() {
  const ref = createGameForVariant('xiangqi', 'standard')
  loadFen(ref, `${HOME} w - - 0 1`)
  return ref.raw.store.get('xiangqi').board.map(c => (c ? c.type : null))
}

describe('the deal', () => {
  it('covers every piece except the General', () => {
    const board = slice(game(7)).board
    const pieces = board.filter(Boolean)
    expect(pieces).toHaveLength(32)
    expect(pieces.filter(c => c.type === 'general')).toHaveLength(2)
    expect(pieces.filter(c => c.type === 'covered')).toHaveLength(30)
    expect(pieces.filter(c => c.type === 'general' && c.trueType !== undefined)).toEqual([])
  })

  it('deals each side exactly the pieces it should own, no more and no fewer', () => {
    const board = slice(game(7)).board
    for (const owner of [0, 1]) {
      const dealt = board.filter(c => c && c.type === 'covered' && c.owner === owner).map(c => c.trueType).sort()
      const expected = ['advisor', 'advisor', 'cannon', 'cannon', 'chariot', 'chariot',
        'elephant', 'elephant', 'horse', 'horse',
        'soldier', 'soldier', 'soldier', 'soldier', 'soldier'].sort()
      expect(dealt).toEqual(expected)
    }
  })

  it('puts the home type on every covered square, taken from the declared array', () => {
    const board = slice(game(7)).board
    const home = homeTypes()
    board.forEach((cell, i) => {
      if (cell && cell.type === 'covered') expect(cell.homeType).toBe(home[i])
    })
  })

  it('actually shuffles: most pieces are not what their square says', () => {
    const board = slice(game(7)).board
    const covered = board.filter(c => c && c.type === 'covered')
    const misplaced = covered.filter(c => c.trueType !== c.homeType)
    expect(misplaced.length).toBeGreaterThan(0)
  })

  it('is reproducible from the seed, because a session has to be resumable', () => {
    const a = slice(game(42)).board.map(c => (c ? c.trueType : null))
    const b = slice(game(42)).board.map(c => (c ? c.trueType : null))
    expect(a).toEqual(b)
  })

  it('a different seed deals a different army', () => {
    const a = slice(game(1)).board.map(c => (c ? c.trueType : null))
    const b = slice(game(999)).board.map(c => (c ? c.trueType : null))
    expect(a).not.toEqual(b)
  })
})

describe('a covered piece moves as its square, not as itself', () => {
  it('opens with exactly the moves ordinary Xiangqi opens with', () => {
    // Every covered piece moves as its home type, so the move list is the
    // standard array's. If a covered piece moved as its true identity this
    // number would wander with the seed.
    for (const seed of [1, 42, 999]) {
      expect(game(seed).getLegalMoves()).toHaveLength(44)
    }
  })

  it('a fake Chariot on a corner slides like a Chariot whatever it really is', () => {
    const g = game(3)
    const board = slice(g).board
    const corner = 9 * COLS + 0            // a1, a Chariot's home square
    expect(board[corner].homeType).toBe('chariot')
    const from = g.getLegalMoves().filter(m => m.from === corner)
    // The square in front of it is a Cannon's home rank and is empty, so a
    // Chariot can step up the file. A Horse or Elephant could not reach it.
    expect(from.some(m => m.to === 7 * COLS + 0)).toBe(true)
  })

  it('a fake Advisor is confined to the palace like a real one', () => {
    const g = game(3)
    const board = slice(g).board
    const advisorSquare = 9 * COLS + 3
    expect(board[advisorSquare].homeType).toBe('advisor')
    const dests = g.getLegalMoves().filter(m => m.from === advisorSquare).map(m => m.to)
    for (const to of dests) {
      const r = Math.floor(to / COLS), c = to % COLS
      expect(c >= 3 && c <= 5).toBe(true)
      expect(r >= 7).toBe(true)
    }
  })
})

describe('moving turns a piece face up', () => {
  it('the piece that lands is its true self, and is no longer covered', () => {
    const g = game(3)
    const before = slice(g).board
    const move = g.getLegalMoves()[0]
    const truth = before[move.from].trueType
    expect(before[move.from].type).toBe('covered')
    g.applyMove(move)
    const after = slice(g).board
    expect(after[move.to].type).not.toBe('covered')
    expect(after[move.to].type).toBe(truth)
    expect(after[move.from]).toBeNull()
  })

  it('and then moves as itself: a revealed piece is no longer bound by its square', () => {
    const g = game(3)
    const move = g.getLegalMoves()[0]
    g.applyMove(move)
    const landed = slice(g).board[move.to]
    expect(landed.homeType).toBeUndefined()
  })
})

describe('what a seat may see', () => {
  it('declares that its slice holds a secret', () => {
    expect(game(3).hasHiddenState()).toBe(true)
  })

  it('shows no covered piece\'s true identity to either seat', () => {
    const g = game(3)
    const truth = slice(g).board
    for (const seat of [0, 1]) {
      const seen = g.viewForSeat(seat).xiangqi.board
      seen.forEach((cell, i) => {
        if (!cell || cell.type !== 'covered') return
        expect(cell.trueType).toBeUndefined()
        expect(truth[i].trueType).toBeDefined()
      })
    }
  })

  it('still shows where the pieces are and what they move as', () => {
    const g = game(3)
    const seen = g.viewForSeat(0).xiangqi.board
    expect(seen.filter(Boolean)).toHaveLength(32)
    expect(seen.filter(c => c && c.type === 'covered').every(c => c.homeType)).toBe(true)
  })

  it('the hidden army does not survive serialisation', () => {
    const g = game(3)
    const wire = JSON.stringify(g.viewForSeat(0))
    const truth = slice(g).board
    const hiddenSoldiers = truth.filter(c => c && c.type === 'covered' && c.trueType === 'soldier').length
    expect(hiddenSoldiers).toBeGreaterThan(0)
    // 'soldier' may legitimately appear as a homeType, so count instead: the
    // view must contain no more soldier mentions than there are soldier HOME
    // squares, which is the public information.
    const homeSoldiers = truth.filter(c => c && c.type === 'covered' && c.homeType === 'soldier').length
    const mentions = (wire.match(/"soldier"/g) || []).length
    expect(mentions).toBe(homeSoldiers)
  })

  it('reveals a piece to both seats once it has moved', () => {
    const g = game(3)
    const move = g.getLegalMoves()[0]
    const truth = slice(g).board[move.from].trueType
    g.applyMove(move)
    for (const seat of [0, 1]) {
      expect(g.viewForSeat(seat).xiangqi.board[move.to].type).toBe(truth)
    }
  })
})

describe('nothing that writes a position writes the hidden army', () => {
  // The first cut stored the true identity in `type` and kept the covered
  // state in a flag. Everything generic reads `type`, so `toFen` published the
  // whole hidden army in the opening position and the board would have
  // rendered face-up. The truth lives in `trueType` now, and the safe value is
  // what a consumer gets by default.
  it('the opening FEN is the declared setup, every piece face down', () => {
    for (const seed of [1, 42, 999]) {
      expect(toFen(game(seed)).split(' ')[0])
        .toBe('ffffkffff/9/1f5f1/f1f1f1f1f/9/9/F1F1F1F1F/1F5F1/9/FFFFKFFFF')
    }
  })

  it('a revealed piece does appear in the FEN, so it is not merely blanked', () => {
    const g = game(3)
    const move = g.getLegalMoves()[0]
    const revealed = slice(g).board[move.from].trueType
    g.applyMove(move)
    const symbol = { chariot: 'R', horse: 'H', elephant: 'E', advisor: 'A', cannon: 'C', soldier: 'P' }[revealed]
    expect(toFen(g).split(' ')[0]).toContain(symbol)
  })
})

describe('ordinary Xiangqi is untouched', () => {
  it('declares no secret and covers nothing', () => {
    const g = createGameForVariant('xiangqi', 'standard')
    expect(g.hasHiddenState()).toBe(false)
    expect(slice(g).board.filter(c => c && c.type === 'covered')).toEqual([])
  })
})
