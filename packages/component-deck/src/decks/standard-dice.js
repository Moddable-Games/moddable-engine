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

  games: {
    'yahtzee': { minPlayers: 1, maxPlayers: 4, defaultPlayers: 2, count: 5, perPlayer: 0, community: 5 },
    'farkle': { minPlayers: 2, maxPlayers: 6, defaultPlayers: 4, count: 6, perPlayer: 0, community: 6 },
    'liars-dice': { minPlayers: 2, maxPlayers: 6, defaultPlayers: 4, count: 5, perPlayer: 5, community: 0 },
  },
})
