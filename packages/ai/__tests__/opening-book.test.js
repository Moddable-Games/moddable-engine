import { createOpeningBook } from '../src/opening-book.js'

describe('AI — opening book', () => {
  const bookData = {
    standard: {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4', 'g1f3'],
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3': ['e7e5', 'c7c5'],
    },
    kingOfTheHill: {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e4', 'd2d4'],
    },
    antichess: {
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': ['e2e3', 'b2b4'],
    },
  }

  describe('probe', () => {
    it('returns a random move from available options', () => {
      const book = createOpeningBook(bookData)
      const move = book.probe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
      expect(['e2e4', 'd2d4', 'g1f3']).toContain(move)
    })

    it('returns null for unknown position', () => {
      const book = createOpeningBook(bookData)
      expect(book.probe('unknown/position')).toBe(null)
    })

    it('returns null for empty book', () => {
      const book = createOpeningBook({})
      expect(book.probe('any')).toBe(null)
    })

    it('uses variant-specific book when provided', () => {
      const book = createOpeningBook(bookData)
      const move = book.probe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', 'antichess')
      expect(['e2e3', 'b2b4']).toContain(move)
    })

    it('falls back to standard when variant has no entry', () => {
      const book = createOpeningBook(bookData)
      const move = book.probe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3', 'kingOfTheHill')
      expect(['e7e5', 'c7c5']).toContain(move)
    })
  })

  describe('hasPosition', () => {
    it('returns true for known position', () => {
      const book = createOpeningBook(bookData)
      expect(book.hasPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toBe(true)
    })

    it('returns false for unknown position', () => {
      const book = createOpeningBook(bookData)
      expect(book.hasPosition('unknown')).toBe(false)
    })
  })

  describe('getAllMoves', () => {
    it('returns all available moves for position', () => {
      const book = createOpeningBook(bookData)
      const moves = book.getAllMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
      expect(moves).toEqual(['e2e4', 'd2d4', 'g1f3'])
    })

    it('returns empty array for unknown position', () => {
      const book = createOpeningBook(bookData)
      expect(book.getAllMoves('unknown')).toEqual([])
    })
  })

  describe('getVariants', () => {
    it('lists available variant books', () => {
      const book = createOpeningBook(bookData)
      expect(book.getVariants()).toEqual(['standard', 'kingOfTheHill', 'antichess'])
    })
  })
})
