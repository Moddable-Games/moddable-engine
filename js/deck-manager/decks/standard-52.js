import { registerDeck } from '../deck-registry.js'

const SUITS = ['spades', 'hearts', 'clubs', 'diamonds']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

registerDeck('standard-52', {
  label: 'Standard 52',
  cardCount: 52,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'standard-52-cards',

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

  games: {
    'big2': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 'all', community: 0 },
    'president': { minPlayers: 4, maxPlayers: 8, defaultPlayers: 4, perPlayer: 'all', community: 0 },
    'poker': { minPlayers: 2, maxPlayers: 10, defaultPlayers: 6, perPlayer: 2, community: 5, remainder: 'draw' },
    'blackjack': { minPlayers: 2, maxPlayers: 7, defaultPlayers: 4, perPlayer: 2, community: 0, remainder: 'draw' },
    'bridge': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0 },
    'canasta': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 11, community: 0, remainder: 'draw' },
    'cribbage': { minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, perPlayer: 6, community: 0, remainder: 'draw' },
    'euchre': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 5, community: 0, remainder: 'draw' },
    'gin-rummy': { minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, perPlayer: 10, community: 0, remainder: 'draw' },
    'hearts': { minPlayers: 3, maxPlayers: 6, defaultPlayers: 4, perPlayer: 'all', community: 0 },
    'klondike': { minPlayers: 1, maxPlayers: 1, defaultPlayers: 1, perPlayer: 28, community: 0, remainder: 'draw' },
    'spades': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0 },
  },
})

function suitSymbol(s) {
  return ['♠', '♥', '♣', '♦'][s]
}
