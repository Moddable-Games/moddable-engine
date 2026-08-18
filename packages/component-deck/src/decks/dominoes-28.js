import { registerDeck } from '../deck-registry.js'

// A tile's `art` is the gallery key its picture is filed under; the piece set
// is chosen in frontmatter (engine.pieces.set), not here.
function tileArt(low, high) {
  return `domino-${String(low).padStart(2, '0')}-${String(high).padStart(2, '0')}`
}

registerDeck('dominoes-28', {
  label: 'Double-Six Dominoes',
  cardCount: 28,
  maxPips: 6,
  cardWidth: 32,
  cardHeight: 60,
  tileBackground: true,
  backArt: 'domino-back',

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
          art: tileArt(a, b),
        })
      }
    }
    return tiles
  },
})
