import { registerDeck } from '../deck-registry.js'

registerDeck('dominoes-28', {
  label: 'Double-Six Dominoes',
  cardCount: 28,
  maxPips: 6,
  cardWidth: 32,
  cardHeight: 60,
  pieceSet: 'dominoes-classic',

  getImagePath(card) {
    const a = String(card.low).padStart(2, '0')
    const b = String(card.high).padStart(2, '0')
    return `domino-${a}-${b}.svg`
  },

  getBackPath() {
    return 'domino-back.svg'
  },

  create(opts = {}) {
    const max = opts.maxPips || 6
    const tiles = []
    for (let a = 0; a <= max; a++) {
      for (let b = a; b <= max; b++) {
        tiles.push({
          id: `${a}_${b}`,
          high: b,
          low: a,
          isDouble: a === b,
          total: a + b,
          display: `[${a}|${b}]`,
        })
      }
    }
    return tiles
  },
})
