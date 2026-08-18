import { registerDeck } from '../deck-registry.js'

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

registerDeck('standard-52', {
  label: 'Standard 52',
  cardCount: 52,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'letele-cards',

  getImagePath(card) {
    if (card.suit === 'joker') return 'J-1.svg'
    const suitLetter = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[card.suit]
    return `${suitLetter}-${card.rank}.svg`
  },

  getBackPath() {
    return 'B-1.svg'
  },

  create(opts = {}) {
    const jokers = opts.jokers || 0
    const cards = []
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 13; r++) {
        cards.push({
          id: `${SUITS[s]}_${RANKS[r]}`,
          suit: SUITS[s],
          rank: RANKS[r],
          rankValue: r + 1,
          suitIndex: s,
          display: `${RANKS[r]}${suitSymbol(s)}`,
        })
      }
    }
    for (let j = 0; j < jokers; j++) {
      cards.push({
        id: `joker_${j + 1}`,
        suit: 'joker',
        rank: 'Joker',
        rankValue: 0,
        suitIndex: 4,
        display: 'Jkr',
      })
    }
    return cards
  },
})

function suitSymbol(s) {
  return ['♠', '♥', '♣', '♦'][s]
}
