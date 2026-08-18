import { registerDeck } from '../deck-registry.js'
import { createSeededRng } from '../../../core/index.js'

// A die's `art` is the gallery key its picture is filed under; the piece set is
// chosen in frontmatter (engine.pieces.set), not here. An unrolled die shows
// the indeterminate face.
const FACE_ART = ['one', 'two', 'three', 'four', 'five', 'six']

function faceArt(value) {
  return FACE_ART[value - 1] ? `wdice${FACE_ART[value - 1]}` : 'wdicerandom'
}

registerDeck('standard-dice', {
  label: 'Standard Dice',
  cardCount: 0,
  cardWidth: 48,
  cardHeight: 48,

  // Dice are not dealt from a fixed pool: the table needs as many as the deal
  // asks for, so the deal spec becomes a count rather than being passed through.
  dealOpts(dealSpec, players) {
    return { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
  },

  create(opts = {}) {
    const count = opts.count || 5
    return Array.from({ length: count }, (_, i) => ({
      id: `die_${i}`,
      faces: 6,
      value: null,
      display: '?',
      art: faceArt(null),
    }))
  },

  roll(dice, seed) {
    const rng = createSeededRng(seed)
    return dice.map(die => {
      const value = (Math.abs(rng.next()) % die.faces) + 1
      const display = String((Math.abs(rng.next()) % die.faces) + 1)
      return { ...die, value, display, art: faceArt(value) }
    })
  },
})
