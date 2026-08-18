import { registerDeck } from '../deck-registry.js'

const SUITS = ['acorns', 'leaves', 'hearts', 'bells']
const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A']

// Artwork keys, positional with SUITS. A card's `art` is the gallery key its
// picture is filed under; the piece set is chosen in frontmatter
// (engine.pieces.set), not here. Two of the four suits use the older
// unter/ober/konig court names and two use jack/queen/king.
const SUIT_ART = ['eichel', 'blatt', 'hart', 'schellen']
const COURT_ART = [
  { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
  { U: '11_jack', O: '12_queen', K: '13_king', A: '01_daus' },
  { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
  { U: '11_jack', O: '12_queen', K: '13_king', A: '01' },
]
const PIP_ART = { 7: '07', 8: '08', 9: '09', 10: '10' }

function cardArt(suitIndex, rank) {
  return `${SUIT_ART[suitIndex]}-${COURT_ART[suitIndex][rank] || PIP_ART[rank] || rank}`
}

registerDeck('bavarian-32', {
  label: 'Bavarian 32',
  cardCount: 32,
  cardWidth: 44,
  cardHeight: 64,
  suits: SUITS,
  ranks: RANKS,

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
          art: cardArt(s, RANKS[r]),
        })
      }
    }
    return cards
  },
})

function suitGlyph(s) {
  return ['🌰', '🍃', '♥', '🔔'][s]
}
