import { createGridTopology } from '../index.js'

describe('topology-grid: position notation', () => {
  const chessVocabulary = {
    king:   { symbols: { 0: 'K', 1: 'k' } },
    queen:  { symbols: { 0: 'Q', 1: 'q' } },
    rook:   { symbols: { 0: 'R', 1: 'r' } },
    bishop: { symbols: { 0: 'B', 1: 'b' } },
    knight: { symbols: { 0: 'N', 1: 'n' } },
    pawn:   { symbols: { 0: 'P', 1: 'p' } },
  }

  const goVocabulary = {
    stone: { symbols: { 0: 'X', 1: 'O' } },
  }

  describe('serializePosition()', () => {
    it('serializes empty board', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const cells = new Array(64).fill(null)
      const result = grid.serializePosition(cells, chessVocabulary)
      expect(result).toBe('8/8/8/8/8/8/8/8')
    })

    it('serializes chess starting position', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const cells = new Array(64).fill(null)
      // Row 0 (rank 8): rnbqkbnr
      cells[0] = { type: 'rook', owner: 1 }
      cells[1] = { type: 'knight', owner: 1 }
      cells[2] = { type: 'bishop', owner: 1 }
      cells[3] = { type: 'queen', owner: 1 }
      cells[4] = { type: 'king', owner: 1 }
      cells[5] = { type: 'bishop', owner: 1 }
      cells[6] = { type: 'knight', owner: 1 }
      cells[7] = { type: 'rook', owner: 1 }
      // Row 1 (rank 7): pppppppp
      for (let c = 0; c < 8; c++) cells[8 + c] = { type: 'pawn', owner: 1 }
      // Row 6 (rank 2): PPPPPPPP
      for (let c = 0; c < 8; c++) cells[48 + c] = { type: 'pawn', owner: 0 }
      // Row 7 (rank 1): RNBQKBNR
      cells[56] = { type: 'rook', owner: 0 }
      cells[57] = { type: 'knight', owner: 0 }
      cells[58] = { type: 'bishop', owner: 0 }
      cells[59] = { type: 'queen', owner: 0 }
      cells[60] = { type: 'king', owner: 0 }
      cells[61] = { type: 'bishop', owner: 0 }
      cells[62] = { type: 'knight', owner: 0 }
      cells[63] = { type: 'rook', owner: 0 }

      const result = grid.serializePosition(cells, chessVocabulary)
      expect(result).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
    })

    it('serializes mid-game position with gaps', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const cells = new Array(64).fill(null)
      cells[0] = { type: 'rook', owner: 1 }
      cells[4] = { type: 'king', owner: 1 }
      cells[7] = { type: 'rook', owner: 1 }

      const result = grid.serializePosition(cells, chessVocabulary)
      expect(result.split('/')[0]).toBe('r3k2r')
    })

    it('serializes Go position', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const cells = new Array(25).fill(null)
      cells[12] = { type: 'stone', owner: 0 } // center
      cells[7] = { type: 'stone', owner: 1 }  // above center

      const result = grid.serializePosition(cells, goVocabulary)
      expect(result).toBe('5/2O2/2X2/5/5')
    })
  })

  describe('parsePosition()', () => {
    it('parses chess starting FEN position', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
      const cells = grid.parsePosition(fen, chessVocabulary)

      expect(cells[0]).toEqual({ type: 'rook', owner: 1 })
      expect(cells[4]).toEqual({ type: 'king', owner: 1 })
      expect(cells[8]).toEqual({ type: 'pawn', owner: 1 })
      expect(cells[56]).toEqual({ type: 'rook', owner: 0 })
      expect(cells[60]).toEqual({ type: 'king', owner: 0 })
      expect(cells[32]).toBeNull() // empty middle
    })

    it('parses mid-game position', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const fen = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R'
      const cells = grid.parsePosition(fen, chessVocabulary)

      expect(cells[0]).toEqual({ type: 'rook', owner: 1 })
      expect(cells[1]).toBeNull()
      expect(cells[4]).toEqual({ type: 'king', owner: 1 })
      expect(cells[56]).toEqual({ type: 'rook', owner: 0 })
      expect(cells[60]).toEqual({ type: 'king', owner: 0 })
    })

    it('parses Go position', () => {
      const grid = createGridTopology({ rows: 5, cols: 5 })
      const cells = grid.parsePosition('5/2O2/2X2/5/5', goVocabulary)

      expect(cells[12]).toEqual({ type: 'stone', owner: 0 })
      expect(cells[7]).toEqual({ type: 'stone', owner: 1 })
      expect(cells[0]).toBeNull()
    })

    it('round-trips: serialize → parse → serialize', () => {
      const grid = createGridTopology({ rows: 8, cols: 8 })
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR'
      const cells = grid.parsePosition(fen, chessVocabulary)
      const result = grid.serializePosition(cells, chessVocabulary)
      expect(result).toBe(fen)
    })
  })

  describe('topology-agnostic: same vocabulary on different grid sizes', () => {
    it('works on 9x9 Go board', () => {
      const grid = createGridTopology({ rows: 9, cols: 9 })
      const cells = new Array(81).fill(null)
      cells[40] = { type: 'stone', owner: 0 }
      const result = grid.serializePosition(cells, goVocabulary)
      expect(result.split('/').length).toBe(9)
      expect(result.split('/')[4]).toBe('4X4')
    })

    it('works on 19x19 Go board', () => {
      const grid = createGridTopology({ rows: 19, cols: 19 })
      const cells = new Array(361).fill(null)
      const result = grid.serializePosition(cells, goVocabulary)
      // 19 is encoded as "19" not "9" + something
      expect(result.split('/')[0]).toBe('19')
    })

    it('chess vocabulary on 10x10 board (grand chess)', () => {
      const grid = createGridTopology({ rows: 10, cols: 10 })
      const cells = new Array(100).fill(null)
      cells[0] = { type: 'rook', owner: 1 }
      cells[9] = { type: 'rook', owner: 1 }
      const result = grid.serializePosition(cells, chessVocabulary)
      expect(result.split('/')[0]).toBe('r8r')
    })
  })
})
