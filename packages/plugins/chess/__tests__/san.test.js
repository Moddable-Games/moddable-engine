import { moveToSAN } from '../src/san.js'

const TOPO = { rows: 8, cols: 8 }

function makeBoard() {
  const b = new Array(64).fill(null)
  b[52] = { type: 'pawn', owner: 0 }
  b[36] = { type: 'pawn', owner: 0 }
  b[4] = { type: 'king', owner: 1 }
  b[60] = { type: 'king', owner: 0 }
  b[56] = { type: 'rook', owner: 0 }
  b[63] = { type: 'rook', owner: 0 }
  b[57] = { type: 'knight', owner: 0 }
  return b
}

describe('SAN notation', () => {
  it('pawn advance', () => {
    const board = makeBoard()
    expect(moveToSAN({ from: 52, to: 44 }, board, TOPO)).toBe('e3')
  })

  it('pawn capture', () => {
    const board = makeBoard()
    board[43] = { type: 'pawn', owner: 1 }
    expect(moveToSAN({ from: 52, to: 43, capture: true }, board, TOPO)).toBe('exd3')
  })

  it('knight move with file disambiguation', () => {
    const board = makeBoard()
    board[42] = { type: 'knight', owner: 0 }
    expect(moveToSAN({ from: 57, to: 42 }, board, TOPO)).toBe('Nbc3')
  })

  it('promotion', () => {
    const board = makeBoard()
    board[8] = { type: 'pawn', owner: 0 }
    board[0] = null
    expect(moveToSAN({ from: 8, to: 0, promotion: 'queen' }, board, TOPO)).toBe('a8=Q')
  })

  it('castling kingside', () => {
    const board = makeBoard()
    expect(moveToSAN({ from: 60, to: 62, castle: true }, board, TOPO)).toBe('O-O')
  })

  it('castling queenside', () => {
    const board = makeBoard()
    expect(moveToSAN({ from: 60, to: 58, castle: true }, board, TOPO)).toBe('O-O-O')
  })

  it('drop (crazyhouse)', () => {
    const board = makeBoard()
    expect(moveToSAN({ action: 'drop', type: 'knight', to: 36 }, board, TOPO)).toBe('N@e4')
  })

  it('blocker placement (duck chess)', () => {
    const board = makeBoard()
    expect(moveToSAN({ action: 'blocker', to: 28 }, board, TOPO)).toBe('🦆e5')
  })
})
