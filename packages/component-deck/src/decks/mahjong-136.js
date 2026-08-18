import { registerDeck } from '../deck-registry.js'

const SUITS = ['bamboo', 'circles', 'characters']
const WINDS = ['east', 'south', 'west', 'north']
const DRAGONS = ['red', 'green', 'white']

// A tile's `art` is the gallery key its picture is filed under. Suit plus rank
// identifies a tile in every set, so no naming table is needed here; the set
// itself is chosen in frontmatter (engine.pieces.set).
function tileArt(suit, rank) {
  return `${suit}-${rank}`
}

registerDeck('mahjong-136', {
  label: 'Mahjong 136',
  cardCount: 136,
  cardWidth: 44,
  cardHeight: 64,
  suits: SUITS,
  winds: WINDS,
  dragons: DRAGONS,
  tileBackground: true,
  backArt: 'back',

  create(opts = {}) {
    const flowers = opts.flowers || 0
    const tiles = []

    for (let copy = 0; copy < 4; copy++) {
      for (let s = 0; s < 3; s++) {
        for (let r = 1; r <= 9; r++) {
          tiles.push({
            id: `${SUITS[s]}_${r}_${copy}`,
            category: 'suited',
            suit: SUITS[s],
            rank: r,
            copy,
            display: `${r} ${SUITS[s]}`,
            art: tileArt(SUITS[s], r),
          })
        }
      }
      for (let w = 0; w < 4; w++) {
        tiles.push({
          id: `wind_${WINDS[w]}_${copy}`,
          category: 'honor',
          suit: 'wind',
          rank: WINDS[w],
          copy,
          display: `${WINDS[w]} wind`,
          art: tileArt('wind', WINDS[w]),
        })
      }
      for (let d = 0; d < 3; d++) {
        tiles.push({
          id: `dragon_${DRAGONS[d]}_${copy}`,
          category: 'honor',
          suit: 'dragon',
          rank: DRAGONS[d],
          copy,
          display: `${DRAGONS[d]} dragon`,
          art: tileArt('dragon', DRAGONS[d]),
        })
      }
    }

    const flowerNames = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo']
    const seasonNames = ['Spring', 'Summer', 'Autumn', 'Winter']
    for (let f = 0; f < Math.min(flowers, 4); f++) {
      tiles.push({
        id: `flower_${f + 1}`,
        category: 'bonus',
        suit: 'flower',
        rank: f + 1,
        copy: 0,
        display: flowerNames[f],
        art: tileArt('flower', f + 1),
      })
    }
    for (let s = 0; s < Math.min(flowers - 4, 4); s++) {
      tiles.push({
        id: `season_${s + 1}`,
        category: 'bonus',
        suit: 'season',
        rank: s + 1,
        copy: 0,
        display: seasonNames[s],
        art: tileArt('season', s + 1),
      })
    }

    return tiles
  },
})
