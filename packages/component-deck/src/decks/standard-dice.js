import { registerDeck } from '../deck-registry.js'
import { createSeededRng } from '../../../core/index.js'

registerDeck('standard-dice', {
  label: 'Standard Dice',
  cardCount: 0,
  pieceSet: 'playstrategy-backgammon',

  getImagePath(card) {
    const valueNames = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' }
    const name = valueNames[card.value]
    if (name) return `wdice${name}.svg`
    return 'wdicerandom.svg'
  },

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
