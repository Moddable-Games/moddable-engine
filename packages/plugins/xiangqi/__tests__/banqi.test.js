import { createGameForVariant, loadFen, toFen } from '../../../play/src/fen.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import '../../index.js'

// Banqi (半棋, "Half Chess"): a Xiangqi set on half a Xiangqi board, all 32
// pieces face down. Rules transcribed in the rulebook from
// en.wikipedia.org/wiki/Banqi, Taiwanese version.
//
// Three things make it a different game from Jieqi rather than a smaller one:
// a face-down piece has no COLOUR until the first flip decides who commands
// which side; a face-down piece cannot be captured at all, only turned over;
// and capture compares the two pieces' ranks rather than asking how the
// attacker moves.

const COLS = 8
const at = (r, c) => r * COLS + c

function game(seed = 5) {
  return createGameForVariant('xiangqi', 'banqi', { rngSeed: seed })
}
function slice(g) {
  return g.raw.store.get('xiangqi')
}
function position(fen) {
  const g = game()
  loadFen(g, fen)
  return g
}
const dest = (g, from) => g.getLegalMoves().filter(m => m.from === from).map(m => m.to)

describe('the deal', () => {
  it('fills all 32 squares, every piece face down and owned by nobody', () => {
    const board = slice(game()).board
    expect(board.filter(Boolean)).toHaveLength(32)
    expect(board.every(c => c.type === 'covered')).toBe(true)
    expect(board.every(c => c.owner === -1)).toBe(true)
  })

  it('deals a full Xiangqi set, sixteen of each colour', () => {
    const board = slice(game()).board
    for (const colour of [0, 1]) {
      const mine = board.filter(c => c.trueColour === colour).map(c => c.trueType).sort()
      expect(mine).toHaveLength(16)
      expect(mine).toEqual([
        'advisor', 'advisor', 'cannon', 'cannon', 'chariot', 'chariot',
        'elephant', 'elephant', 'general', 'horse', 'horse',
        'soldier', 'soldier', 'soldier', 'soldier', 'soldier'].sort())
    }
  })

  it('writes a FEN that is the declared setup and nothing more', () => {
    for (const seed of [1, 5, 99]) {
      expect(toFen(game(seed)).split(' ')[0]).toBe('xxxxxxxx/xxxxxxxx/xxxxxxxx/xxxxxxxx')
    }
  })

  it('is reproducible from the seed', () => {
    const key = g => slice(g).board.map(c => `${c.trueType}${c.trueColour}`).join()
    expect(key(game(42))).toBe(key(game(42)))
    expect(key(game(1))).not.toBe(key(game(2)))
  })
})

describe('the opening, when nobody owns anything yet', () => {
  it('offers 32 moves and every one of them is a flip', () => {
    const moves = game().getLegalMoves()
    expect(moves).toHaveLength(32)
    expect(moves.every(m => m.action === 'flip')).toBe(true)
  })

  it('the first flip decides the colours: the flipper commands what comes up', () => {
    // Played from both seats, against both colours, so the mapping is not
    // right by accident on one of them.
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = game(seed)
      const flip = g.getLegalMoves()[0]
      const revealed = slice(g).board[flip.to]
      g.applyMove(flip)
      const after = slice(g)
      // seat 0 made the flip, so seat 0 commands the colour that appeared
      expect(after.colourSeat[revealed.trueColour]).toBe(0)
      expect(after.colourSeat[1 - revealed.trueColour]).toBe(1)
      expect(after.board[flip.to]).toEqual({ type: revealed.trueType, owner: 0 })
    }
  })

  it('and every later reveal follows that same mapping', () => {
    const g = game(5)
    g.applyMove(g.getLegalMoves()[0])
    const map = slice(g).colourSeat
    for (let n = 0; n < 6; n++) {
      const flip = g.getLegalMoves().find(m => m.action === 'flip')
      if (!flip) break
      const truth = slice(g).board[flip.to]
      g.applyMove(flip)
      expect(slice(g).board[flip.to].owner).toBe(map[truth.trueColour])
    }
  })
})

describe('a face-down piece can be flipped and nothing else', () => {
  it('cannot be captured, and cannot be moved onto', () => {
    const g = position('Ax6/8/8/8 w - - 0 1')
    expect(dest(g, at(0, 0))).not.toContain(at(0, 1))
    expect(g.getLegalMoves().some(m => m.action === 'flip' && m.to === at(0, 1))).toBe(true)
  })

  it('which is the opposite of Jieqi, where a covered piece is taken normally', () => {
    const j = createGameForVariant('xiangqi', 'jieqi', { rngSeed: 3 })
    const covered = slice(j).board.filter(c => c && c.type === 'covered').length
    expect(covered).toBeGreaterThan(0)
    // jieqi opens with the standard array's 44 moves, which includes captures
    // onto covered squares; if covered pieces were protected it would be fewer
    expect(j.getLegalMoves()).toHaveLength(44)
  })
})

describe('every piece moves one square orthogonally', () => {
  it.each(['K', 'A', 'E', 'R', 'H', 'P'])('%s steps one square, no further', (symbol) => {
    const g = position(`8/2${symbol}5/8/8 w - - 0 1`)
    const from = at(1, 2)
    expect(dest(g, from).sort((a, b) => a - b))
      .toEqual([at(0, 2), at(1, 1), at(1, 3), at(2, 2)].sort((a, b) => a - b))
  })

  it('the Cannon moves one square like the rest', () => {
    const g = position('8/2C5/8/8 w - - 0 1')
    expect(dest(g, at(1, 2)).sort((a, b) => a - b))
      .toEqual([at(0, 2), at(1, 1), at(1, 3), at(2, 2)].sort((a, b) => a - b))
  })
})

describe('capture compares the two pieces, not how the attacker moves', () => {
  it('takes an equal or lower rank', () => {
    expect(dest(position('Ap6/8/8/8 w - - 0 1'), 0)).toContain(1)
  })

  it('and not a higher one', () => {
    expect(dest(position('Pa6/8/8/8 w - - 0 1'), 0)).not.toContain(1)
  })

  it('the Soldier takes the General, despite being the lowest rank', () => {
    expect(dest(position('Pk6/8/8/8 w - - 0 1'), 0)).toContain(1)
  })

  it('and the General may not take the Soldier', () => {
    expect(dest(position('Kp6/8/8/8 w - - 0 1'), 0)).not.toContain(1)
  })

  it('a piece takes its own equal', () => {
    expect(dest(position('Hh6/8/8/8 w - - 0 1'), 0)).toContain(1)
  })

  it('and never a friendly piece of any rank', () => {
    expect(dest(position('AP6/8/8/8 w - - 0 1'), 0)).not.toContain(1)
  })
})

describe('the Cannon is unranked and needs a screen', () => {
  it('cannot take the piece standing next to it, because there is nothing to jump', () => {
    expect(dest(position('Ck6/8/8/8 w - - 0 1'), 0)).not.toContain(1)
  })

  it('takes over exactly one screen, at any distance', () => {
    // cannon a, screen b, victim c
    expect(dest(position('CPk5/8/8/8 w - - 0 1'), 0)).toContain(2)
    // and with empty squares beyond the screen
    expect(dest(position('CP2k3/8/8/8 w - - 0 1'), 0)).toContain(4)
  })

  it('takes the highest rank there is, which no ranked piece could', () => {
    // a Soldier screening for a Cannon, taking a General - the Cannon is
    // outside the order entirely
    expect(dest(position('CPk5/8/8/8 w - - 0 1'), 0)).toContain(2)
  })

  it('will not jump two screens', () => {
    expect(dest(position('CPPk4/8/8/8 w - - 0 1'), 0)).not.toContain(3)
  })
})

describe('losing', () => {
  it('a player with no legal move loses', () => {
    const g = position('Ap6/8/8/8 w - - 0 1')
    const take = g.getLegalMoves().find(m => m.from === 0 && m.to === 1)
    const result = g.applyMove(take)
    expect(slice(g).board.filter(Boolean)).toHaveLength(1)
    expect(result.winner).toBe(0)
  })

  it('and nothing is royal: losing the General is losing a piece, not the game', () => {
    const g = position('pK6/7A/8/8 w - - 0 1')
    // red still has the Advisor, so taking the General ends nothing
    const black = position('pK6/7A/8/8 b - - 0 1')
    const take = black.getLegalMoves().find(m => m.from === 0 && m.to === 1)
    expect(take).toBeDefined()
    const result = black.applyMove(take)
    expect(result.winner ?? null).toBeNull()
  })
})

describe('what a seat may see', () => {
  it('declares that its slice holds a secret', () => {
    expect(game().hasHiddenState()).toBe(true)
  })

  it('shows neither the type nor the colour of a face-down piece', () => {
    const g = game()
    for (const seat of [0, 1]) {
      for (const cell of g.viewForSeat(seat).xiangqi.board) {
        if (!cell || cell.type !== 'covered') continue
        expect(cell.trueType).toBeUndefined()
        expect(cell.trueColour).toBeUndefined()
        expect(cell.owner).toBe(-1)
      }
    }
  })

  it('the whole deal is absent from anything sent to a seat', () => {
    const wire = JSON.stringify(game().viewForSeat(0))
    for (const type of ['general', 'advisor', 'elephant', 'chariot', 'horse', 'cannon', 'soldier']) {
      expect(wire).not.toContain(`"${type}"`)
    }
  })
})

describe('a FEN records what a seat can see, so it cannot restore the deal', () => {
  it('says so rather than revealing undefined', () => {
    const g = position('x7/8/8/8 w - - 0 1')
    const flip = g.getLegalMoves().find(m => m.action === 'flip')
    expect(() => g.applyMove(flip)).toThrow(/full snapshot/)
  })
})
