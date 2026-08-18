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

  describe('multi-owner (4-player) round-trip via vocabulary', () => {
    const fen4Vocabulary = {
      king:   { symbols: { 0: 'rK', 1: 'yK', 2: 'gK', 3: 'bK' } },
      queen:  { symbols: { 0: 'rQ', 1: 'yQ', 2: 'gQ', 3: 'bQ' } },
      rook:   { symbols: { 0: 'rR', 1: 'yR', 2: 'gR', 3: 'bR' } },
      bishop: { symbols: { 0: 'rB', 1: 'yB', 2: 'gB', 3: 'bB' } },
      knight: { symbols: { 0: 'rN', 1: 'yN', 2: 'gN', 3: 'bN' } },
      pawn:   { symbols: { 0: 'rP', 1: 'yP', 2: 'gP', 3: 'bP' } },
    }

    const shogiVocabulary = {
      king:   { symbols: { 0: 'rK', 1: 'yK', 2: 'gK', 3: 'bK' } },
      gold:   { symbols: { 0: 'rG', 1: 'yG', 2: 'gG', 3: 'bG' } },
      silver: { symbols: { 0: 'rS', 1: 'yS', 2: 'gS', 3: 'bS' } },
      knight: { symbols: { 0: 'rN', 1: 'yN', 2: 'gN', 3: 'bN' } },
      lance:  { symbols: { 0: 'rL', 1: 'yL', 2: 'gL', 3: 'bL' } },
      rook:   { symbols: { 0: 'rR', 1: 'yR', 2: 'gR', 3: 'bR' } },
      bishop: { symbols: { 0: 'rB', 1: 'yB', 2: 'gB', 3: 'bB' } },
      pawn:   { symbols: { 0: 'rP', 1: 'yP', 2: 'gP', 3: 'bP' } },
    }

    const djambiVocabulary = {
      chief:      { symbols: { 0: 'rC', 1: 'yC', 2: 'gC', 3: 'bC' } },
      assassin:   { symbols: { 0: 'rA', 1: 'yA', 2: 'gA', 3: 'bA' } },
      reporter:   { symbols: { 0: 'rT', 1: 'yT', 2: 'gT', 3: 'bT' } },
      diplomat:   { symbols: { 0: 'rD', 1: 'yD', 2: 'gD', 3: 'bD' } },
      necromobile: { symbols: { 0: 'rX', 1: 'yX', 2: 'gX', 3: 'bX' } },
      militant:   { symbols: { 0: 'rM', 1: 'yM', 2: 'gM', 3: 'bM' } },
    }

    it('parses vierschach setup (14x14, 4 owners)', () => {
      const grid = createGridTopology({ rows: 14, cols: 14 })
      const fen = '3,yR,yN,yB,yK,yQ,yB,yN,yR,3/3,yP,yP,yP,yP,yP,yP,yP,yP,3/14/bR,bP,10,gP,gR/bN,bP,10,gP,gN/bB,bP,10,gP,gB/bK,bP,10,gP,gQ/bQ,bP,10,gP,gK/bB,bP,10,gP,gB/bN,bP,10,gP,gN/bR,bP,10,gP,gR/14/3,rP,rP,rP,rP,rP,rP,rP,rP,3/3,rR,rN,rB,rQ,rK,rB,rN,rR,3'
      const cells = grid.parsePosition(fen, fen4Vocabulary)

      expect(cells[3]).toEqual({ type: 'rook', owner: 1 })
      expect(cells[4]).toEqual({ type: 'knight', owner: 1 })
      expect(cells[42]).toEqual({ type: 'rook', owner: 3 })
      expect(cells[192]).toEqual({ type: 'rook', owner: 0 })
    })

    it('round-trips vierschach: parse → serialize → parse', () => {
      const grid = createGridTopology({ rows: 14, cols: 14 })
      const fen = '3,yR,yN,yB,yK,yQ,yB,yN,yR,3/3,yP,yP,yP,yP,yP,yP,yP,yP,3/14/bR,bP,10,gP,gR/bN,bP,10,gP,gN/bB,bP,10,gP,gB/bK,bP,10,gP,gQ/bQ,bP,10,gP,gK/bB,bP,10,gP,gB/bN,bP,10,gP,gN/bR,bP,10,gP,gR/14/3,rP,rP,rP,rP,rP,rP,rP,rP,3/3,rR,rN,rB,rQ,rK,rB,rN,rR,3'
      const cells = grid.parsePosition(fen, fen4Vocabulary)
      const result = grid.serializePosition(cells, fen4Vocabulary)
      expect(result).toBe(fen)
    })

    it('round-trips four-player-shogi (15x15)', () => {
      const grid = createGridTopology({ rows: 15, cols: 15 })
      const fen = '3,yL,yN,yS,yG,yK,yG,yS,yN,yL,3/4,yB,5,yR,4/3,yP,yP,yP,yP,yP,yP,yP,yP,yP,3/rL,1,rP,9,bP,1,bL/rN,rR,rP,9,bP,bB,bN/rS,1,rP,9,bP,1,bS/rG,1,rP,9,bP,1,bG/rK,1,rP,9,bP,1,bK/rG,1,rP,9,bP,1,bG/rS,1,rP,9,bP,1,bS/rN,rB,rP,9,bP,bR,bN/rL,1,rP,9,bP,1,bL/3,gP,gP,gP,gP,gP,gP,gP,gP,gP,3/4,gR,5,gB,4/3,gL,gN,gS,gG,gK,gG,gS,gN,gL,3'
      const cells = grid.parsePosition(fen, shogiVocabulary)
      const result = grid.serializePosition(cells, shogiVocabulary)
      expect(result).toBe(fen)
    })

    it('round-trips djambi (9x9, non-chess vocabulary)', () => {
      const grid = createGridTopology({ rows: 9, cols: 9 })
      const fen = 'yC,yA,yM,3,gM,gA,gC/yT,yD,yM,3,gM,gD,gT/yM,yM,yX,3,gX,gM,gM/9/9/9/bM,bM,bX,3,rX,rM,rM/bT,bD,bM,3,rM,rD,rT/bC,bA,bM,3,rM,rA,rC'
      const cells = grid.parsePosition(fen, djambiVocabulary)
      const result = grid.serializePosition(cells, djambiVocabulary)
      expect(result).toBe(fen)
    })

    it('non-default player order round-trips correctly', () => {
      const altVocabulary = {
        king:   { symbols: { 0: 'bK', 1: 'gK', 2: 'yK', 3: 'rK' } },
        queen:  { symbols: { 0: 'bQ', 1: 'gQ', 2: 'yQ', 3: 'rQ' } },
        rook:   { symbols: { 0: 'bR', 1: 'gR', 2: 'yR', 3: 'rR' } },
        pawn:   { symbols: { 0: 'bP', 1: 'gP', 2: 'yP', 3: 'rP' } },
      }
      const grid = createGridTopology({ rows: 4, cols: 4 })
      const cells = new Array(16).fill(null)
      cells[0] = { type: 'king', owner: 0 }
      cells[1] = { type: 'queen', owner: 1 }
      cells[14] = { type: 'rook', owner: 2 }
      cells[15] = { type: 'pawn', owner: 3 }
      const result = grid.serializePosition(cells, altVocabulary)
      expect(result).toBe('bK,gQ,2/4/4/2,yR,rP')
      const parsed = grid.parsePosition(result, altVocabulary)
      expect(parsed[0]).toEqual({ type: 'king', owner: 0 })
      expect(parsed[1]).toEqual({ type: 'queen', owner: 1 })
      expect(parsed[14]).toEqual({ type: 'rook', owner: 2 })
      expect(parsed[15]).toEqual({ type: 'pawn', owner: 3 })
    })

    it('throws on undeclared symbol (no fallback)', () => {
      const grid = createGridTopology({ rows: 3, cols: 3 })
      const sparseVocab = {
        king: { symbols: { 0: 'rK', 1: 'yK', 2: 'gK', 3: 'bK' } },
      }
      expect(() => grid.parsePosition('rK,wQ,1/3/3', sparseVocab))
        .toThrow('Unmapped FEN symbol "wQ"')
    })
  })
})
