import { boardToSetup, cellToSymbol, emittableSymbols } from '../src/serialise.js'

const CHESS_VOCAB = {
  king:   { symbols: ['K', 'k'] },
  queen:  { symbols: ['Q', 'q'] },
  rook:   { symbols: ['R', 'r'] },
  bishop: { symbols: ['B', 'b'] },
  knight: { symbols: ['N', 'n'] },
  pawn:   { symbols: ['P', 'p'] },
}

describe('cellToSymbol', () => {
  it('returns symbol for owner 0 (white)', () => {
    expect(cellToSymbol({ type: 'king', owner: 0 }, CHESS_VOCAB)).toBe('K')
  })

  it('returns symbol for owner 1 (black)', () => {
    expect(cellToSymbol({ type: 'queen', owner: 1 }, CHESS_VOCAB)).toBe('q')
  })

  it('returns null for empty cell', () => {
    expect(cellToSymbol(null, CHESS_VOCAB)).toBeNull()
    expect(cellToSymbol(undefined, CHESS_VOCAB)).toBeNull()
  })

  it('handles promoted shogi pieces', () => {
    const vocab = { lance: { symbols: ['L', 'l'] } }
    expect(cellToSymbol({ type: 'promoted_lance', owner: 0 }, vocab)).toBe('+L')
  })
})

describe('boardToSetup — grid (array) boards', () => {
  it('produces FEN for a simple 3x3 grid', () => {
    const board = [
      { type: 'king', owner: 0 }, null, { type: 'king', owner: 1 },
      null, null, null,
      null, null, null,
    ]
    const setup = boardToSetup({ board }, { rows: 3, cols: 3 }, CHESS_VOCAB)
    expect(setup).toBe('K1k/3/3')
  })

  it('produces FEN for standard chess opening', () => {
    const board = new Array(64).fill(null)
    board[0] = { type: 'rook', owner: 0 }
    board[7] = { type: 'rook', owner: 0 }
    board[4] = { type: 'king', owner: 0 }
    const setup = boardToSetup({ board }, { rows: 8, cols: 8 }, CHESS_VOCAB)
    expect(setup).toContain('R')
    expect(setup.split('/').length).toBe(8)
  })
})

describe('boardToSetup — hex (object) boards', () => {
  it('serialises object board to coordinate:symbol format', () => {
    const board = {
      '0,0': { type: 'king', owner: 0 },
      '1,-1': { type: 'queen', owner: 1 },
      '2,0': null,
    }
    const setup = boardToSetup({ board }, {}, CHESS_VOCAB)
    expect(setup).toContain('0,0:K')
    expect(setup).toContain('1,-1:q')
    expect(setup).not.toContain('2,0')
  })

  it('skips cells with no vocabulary match', () => {
    const board = { '0,0': { type: 'unknown', owner: 0 } }
    const setup = boardToSetup({ board }, {}, CHESS_VOCAB)
    expect(setup).toBe('')
  })

  it('round-trips through parseHexPositionString regex', () => {
    const board = {
      '0,0': { type: 'king', owner: 0 },
      '1,0': { type: 'bishop', owner: 0 },
      '-1,1': { type: 'knight', owner: 1 },
      '3,-2': { type: 'pawn', owner: 1 },
    }
    const setup = boardToSetup({ board }, {}, CHESS_VOCAB)
    const parsed = setup.match(/-?\d+,-?\d+:[A-Za-z+]+/g)
    expect(parsed).toHaveLength(4)
    expect(parsed).toContain('0,0:K')
    expect(parsed).toContain('1,0:B')
    expect(parsed).toContain('-1,1:n')
    expect(parsed).toContain('3,-2:p')
  })

  it('handles Glinski-scale board (36 pieces)', () => {
    const board = {}
    const pieces = [
      ['king', 0], ['queen', 0], ['rook', 0], ['rook', 0],
      ['bishop', 0], ['bishop', 0], ['bishop', 0],
      ['knight', 0], ['knight', 0],
      ['pawn', 0], ['pawn', 0], ['pawn', 0], ['pawn', 0],
      ['pawn', 0], ['pawn', 0], ['pawn', 0], ['pawn', 0], ['pawn', 0],
      ['king', 1], ['queen', 1], ['rook', 1], ['rook', 1],
      ['bishop', 1], ['bishop', 1], ['bishop', 1],
      ['knight', 1], ['knight', 1],
      ['pawn', 1], ['pawn', 1], ['pawn', 1], ['pawn', 1],
      ['pawn', 1], ['pawn', 1], ['pawn', 1], ['pawn', 1], ['pawn', 1],
    ]
    let idx = 0
    for (let q = -5; q <= 5 && idx < pieces.length; q++) {
      for (let r = -5; r <= 5 && idx < pieces.length; r++) {
        board[`${q},${r}`] = { type: pieces[idx][0], owner: pieces[idx][1] }
        idx++
      }
    }
    const setup = boardToSetup({ board }, {}, CHESS_VOCAB)
    const parsed = setup.match(/-?\d+,-?\d+:[A-Za-z+]+/g)
    expect(parsed).toHaveLength(36)
  })
})

describe('emittableSymbols', () => {
  it('lists all symbols from vocabulary', () => {
    const symbols = emittableSymbols(CHESS_VOCAB)
    expect(symbols.length).toBe(12)
    expect(symbols.find(s => s.type === 'king' && s.owner === 0).symbol).toBe('K')
  })
})
