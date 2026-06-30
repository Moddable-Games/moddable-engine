import { createStandard52Deck, standard52Schema } from '../index.js'

describe('component-deck: standard-52', () => {
  describe('schema', () => {
    it('declares type and componentType', () => {
      expect(standard52Schema.type).toBe('standard-52')
      expect(standard52Schema.componentType).toBe('deck')
    })
  })

  describe('createStandard52Deck()', () => {
    const deck = createStandard52Deck()

    it('has 4 suits and 13 ranks', () => {
      expect(deck.suits).toHaveLength(4)
      expect(deck.ranks).toHaveLength(13)
      expect(deck.size).toBe(52)
    })

    it('makeDeck() produces 52 unique cards', () => {
      const cards = deck.makeDeck()
      expect(cards).toHaveLength(52)
      expect(new Set(cards).size).toBe(52)
    })

    it('card format is SUIT-RANK', () => {
      const cards = deck.makeDeck()
      expect(cards[0]).toBe('D-3')
      expect(cards[51]).toBe('S-2')
    })
  })

  describe('card operations', () => {
    const deck = createStandard52Deck()

    it('parse() extracts suit and rank', () => {
      expect(deck.parse('H-K')).toEqual({ suit: 'H', rank: 'K' })
      expect(deck.parse('S-2')).toEqual({ suit: 'S', rank: '2' })
    })

    it('cardRank() returns positional index', () => {
      expect(deck.cardRank('D-3')).toBe(0) // lowest
      expect(deck.cardRank('S-2')).toBe(12) // highest (Big 2 ordering)
    })

    it('cardSuit() returns suit index', () => {
      expect(deck.cardSuit('D-3')).toBe(0) // diamonds lowest
      expect(deck.cardSuit('S-2')).toBe(3) // spades highest
    })

    it('cardValue() combines rank and suit for total ordering', () => {
      expect(deck.cardValue('D-3')).toBe(0) // absolute lowest
      expect(deck.cardValue('S-2')).toBe(51) // absolute highest
      expect(deck.cardValue('S-3')).toBeGreaterThan(deck.cardValue('D-3'))
      expect(deck.cardValue('D-4')).toBeGreaterThan(deck.cardValue('S-3'))
    })

    it('compare() sorts by value', () => {
      expect(deck.compare('S-2', 'D-3')).toBeGreaterThan(0)
      expect(deck.compare('D-3', 'S-2')).toBeLessThan(0)
      expect(deck.compare('D-3', 'D-3')).toBe(0)
    })

    it('highCard() returns highest card from array', () => {
      expect(deck.highCard(['D-3', 'H-K', 'S-2'])).toBe('S-2')
    })

    it('beats() compares single cards', () => {
      expect(deck.beats(['H-K'], ['D-J'])).toBe(true)
      expect(deck.beats(['D-J'], ['H-K'])).toBe(false)
    })

    it('beats() rejects mismatched lengths', () => {
      expect(deck.beats(['H-K', 'D-K'], ['D-J'])).toBe(false)
    })

    it('isValid() checks card membership', () => {
      expect(deck.isValid('H-K')).toBe(true)
      expect(deck.isValid('X-Z')).toBe(false)
    })
  })

  describe('deal()', () => {
    const deck = createStandard52Deck()

    it('deals evenly to 4 players', () => {
      const cards = deck.makeDeck()
      const hands = deck.deal(cards, 4)
      expect(hands).toHaveLength(4)
      hands.forEach(h => expect(h).toHaveLength(13))
    })

    it('deals with custom per-player count', () => {
      const cards = deck.makeDeck()
      const hands = deck.deal(cards, 4, 5)
      expect(hands).toHaveLength(4)
      hands.forEach(h => expect(h).toHaveLength(5))
    })
  })

  describe('custom configuration', () => {
    it('accepts custom suits and ranks', () => {
      const deck = createStandard52Deck({
        suits: ['R', 'B'],
        ranks: ['1', '2', '3', '4', '5'],
      })
      expect(deck.suits).toEqual(['R', 'B'])
      expect(deck.ranks).toEqual(['1', '2', '3', '4', '5'])
      expect(deck.size).toBe(10)
      expect(deck.makeDeck()).toHaveLength(10)
    })
  })
})
