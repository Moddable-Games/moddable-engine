import { registerDeck } from '../deck-registry.js'
import { createSeededRng } from '../../../core/src/xorshift.js'

registerDeck('standard-dice', {
  label: 'Standard Dice',
  cardCount: 0,
  pieceSet: null,

  create(opts = {}) {
    const count = opts.count || 5
    return Array.from({ length: count }, (_, i) => ({
      id: `die_${i}`,
      faces: 6,
      value: null,
      display: '?',
    }))
  },

  roll(dice, seed) {
    const rng = createSeededRng(seed)
    return dice.map(die => ({
      ...die,
      value: (Math.abs(rng.next()) % die.faces) + 1,
      display: String((Math.abs(rng.next()) % die.faces) + 1),
    }))
  },
})
