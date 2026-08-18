import { registerDeck } from '../deck-registry.js'

const SUITS = ['acorns', 'leaves', 'hearts', 'bells']
const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A']

registerDeck('bavarian-32', {
  label: 'Bavarian 32',
  cardCount: 32,
  cardWidth: 44,
  cardHeight: 64,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'mfrasca-skat',

  getImagePath(card) {
    const suitMap = { acorns: 'eichel', leaves: 'blatt', hearts: 'hart', bells: 'schellen' }
    const suit = suitMap[card.suit]
    const faceMap = {
      eichel: { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
      hart: { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
      blatt: { U: '11_jack', O: '12_queen', K: '13_king', A: '01_daus' },
      schellen: { U: '11_jack', O: '12_queen', K: '13_king', A: '01' },
    }
    const numericMap = { 7: '07', 8: '08', 9: '09', 10: '10' }
    const rank = faceMap[suit]?.[card.rank] || numericMap[card.rank] || card.rank
    return `Playing_card-german-${suit}-${rank}.svg`
  },

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
