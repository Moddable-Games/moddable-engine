import { registerDeck } from '../deck-registry.js'

registerDeck('dominoes-28', {
  label: 'Double-Six Dominoes',
  cardCount: 28,
  maxPips: 6,
  pieceSet: null,

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

  games: {
    'block': { minPlayers: 2, maxPlayers: 4, defaultPlayers: 2, perPlayer: 7, community: 0, remainder: 'boneyard' },
    'all-fives': { minPlayers: 2, maxPlayers: 4, defaultPlayers: 2, perPlayer: 7, community: 0, remainder: 'boneyard' },
    'mexican-train': { minPlayers: 2, maxPlayers: 8, defaultPlayers: 4, perPlayer: 10, community: 0, remainder: 'boneyard' },
  },
})
