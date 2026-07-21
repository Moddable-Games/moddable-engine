import { registerDeck } from '../deck-registry.js'

const SUITS = ['acorns', 'leaves', 'hearts', 'bells']
const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A']

registerDeck('bavarian-32', {
  label: 'Bavarian 32',
  cardCount: 32,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'bavarian-skat',

  create(opts = {}) {
    const cards = []
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 8; r++) {
        cards.push({
          id: `${SUITS[s]}_${RANKS[r]}`,
          suit: SUITS[s],
          rank: RANKS[r],
          rankValue: r + 7,
          suitIndex: s,
          display: `${RANKS[r]}${suitGlyph(s)}`,
        })
      }
    }
    return cards
  },
})

function suitGlyph(s) {
  return ['🌰', '🍃', '♥', '🔔'][s]
}
