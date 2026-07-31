import { createCellAddressing } from '../play-cells.js'

describe('play-cells — cell addressing', () => {
  describe('standard grid (8x8)', () => {
    const addr = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: false })

    it('toId produces algebraic notation', () => {
      expect(addr.toId(0)).toBe('a8')
      expect(addr.toId(7)).toBe('h8')
      expect(addr.toId(56)).toBe('a1')
      expect(addr.toId(63)).toBe('h1')
    })

    it('toIndex reverses toId', () => {
      expect(addr.toIndex('a8')).toBe(0)
      expect(addr.toIndex('h1')).toBe(63)
      expect(addr.toIndex('e4')).toBe(36)
    })

    it('round-trip: toIndex(toId(i)) === i for every cell', () => {
      for (let i = 0; i < 64; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })
  })

  describe('standard grid flipped (8x8)', () => {
    const addr = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: true })

    it('toId flips the visual position', () => {
      expect(addr.toId(0)).toBe('h1')
      expect(addr.toId(63)).toBe('a8')
    })

    it('round-trip preserved when flipped', () => {
      for (let i = 0; i < 64; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })
  })

  describe('go board (19x19, idStyle go)', () => {
    const addr = createCellAddressing({ rows: 19, cols: 19, idStyle: 'go', flipped: false })

    it('skips I in the alphabet', () => {
      expect(addr.toId(0)).toBe('A19')
      expect(addr.toId(8)).toBe('J19')
      expect(addr.toId(7)).toBe('H19')
    })

    it('I does not appear in any cell id', () => {
      for (let i = 0; i < 361; i++) {
        expect(addr.toId(i)).not.toContain('I')
      }
    })

    it('round-trip for all 361 cells', () => {
      for (let i = 0; i < 361; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })
  })

  describe('go board flipped', () => {
    const addr = createCellAddressing({ rows: 19, cols: 19, idStyle: 'go', flipped: true })

    it('round-trip preserved when flipped', () => {
      for (let i = 0; i < 361; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })
  })

  describe('xiangqi (10x9, standard alphabet)', () => {
    const addr = createCellAddressing({ rows: 10, cols: 9, idStyle: 'algebraic', flipped: false })

    it('column i exists (not skipped)', () => {
      expect(addr.toId(8)).toBe('i10')
    })

    it('round-trip for all 90 cells', () => {
      for (let i = 0; i < 90; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })

    it('round-trip when flipped', () => {
      const flipped = createCellAddressing({ rows: 10, cols: 9, idStyle: 'algebraic', flipped: true })
      for (let i = 0; i < 90; i++) {
        expect(flipped.toIndex(flipped.toId(i))).toBe(i)
      }
    })
  })

  describe('capablanca (8x10)', () => {
    const addr = createCellAddressing({ rows: 8, cols: 10, idStyle: 'algebraic', flipped: false })

    it('round-trip for all 80 cells', () => {
      for (let i = 0; i < 80; i++) {
        expect(addr.toIndex(addr.toId(i))).toBe(i)
      }
    })
  })

  describe('setFlipped toggles behaviour', () => {
    const addr = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: false })

    it('changes output after toggle', () => {
      const before = addr.toId(0)
      addr.setFlipped(true)
      const after = addr.toId(0)
      expect(before).toBe('a8')
      expect(after).toBe('h1')
      addr.setFlipped(false)
    })
  })

  describe('toIndex always returns a number', () => {
    const configs = [
      { rows: 8, cols: 8, idStyle: 'algebraic', label: '8x8 standard' },
      { rows: 8, cols: 10, idStyle: 'algebraic', label: '8x10 capablanca' },
      { rows: 9, cols: 9, idStyle: 'algebraic', label: '9x9 shogi' },
      { rows: 10, cols: 9, idStyle: 'algebraic', label: '10x9 xiangqi' },
      { rows: 19, cols: 19, idStyle: 'go', label: '19x19 go' },
    ]

    it.each(configs)('$label: every toIndex result is typeof number', (cfg) => {
      const addr = createCellAddressing({ ...cfg, flipped: false })
      const total = cfg.rows * cfg.cols
      for (let i = 0; i < total; i++) {
        const id = addr.toId(i)
        const result = addr.toIndex(id)
        expect(typeof result).toBe('number')
      }
    })
  })

  describe('edge cases', () => {
    const addr = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: false })

    it('toIndex returns -1 for invalid input', () => {
      expect(addr.toIndex('')).toBe(-1)
      expect(addr.toIndex(null)).toBe(-1)
      expect(addr.toIndex('z9')).toBe(-1)
    })

    it('toId returns null for out of bounds', () => {
      expect(addr.toId(-1)).toBe(null)
      expect(addr.toId(64)).toBe(null)
    })
  })
})
