import { registerDeck } from '../deck-registry.js'

const SUITS = ['bamboo', 'circles', 'characters']
const WINDS = ['east', 'south', 'west', 'north']
const DRAGONS = ['red', 'green', 'white']

registerDeck('mahjong-136', {
  label: 'Mahjong 136',
  cardCount: 136,
  suits: SUITS,
  winds: WINDS,
  dragons: DRAGONS,
  pieceSet: null,

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
        })
      }
    }

    for (let f = 0; f < flowers; f++) {
      tiles.push({
        id: `flower_${f}`,
        category: 'bonus',
        suit: 'flower',
        rank: f + 1,
        copy: 0,
        display: `Flower ${f + 1}`,
      })
    }

    return tiles
  },

  games: {
    'hong-kong': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0, remainder: 'wall', flowers: 8 },
    'riichi': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0, remainder: 'wall' },
    'taiwanese': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 16, community: 0, remainder: 'wall', flowers: 8 },
    'zung-jung': { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0, remainder: 'wall' },
  },
})
