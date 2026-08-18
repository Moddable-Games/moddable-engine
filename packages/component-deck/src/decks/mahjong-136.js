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
  pieceSet: 'mahjong-regular',

  getImagePath(card, opts) {
    const tileSet = opts?.tileSet || 'mahjong-regular'
    if (tileSet === 'mahjong-planar') {
      const suitFileMap = { bamboo: 'tiao', circles: 'bing', characters: 'wan' }
      const windFileMap = { east: 'Eastwind', south: 'Southwind', west: 'Westwind', north: 'Northwind' }
      const dragonFileMap = { red: 'Reddragon', green: 'Greendragon', white: 'Whitedragon' }
      if (card.suit === 'wind') return `MJ${windFileMap[card.rank]}.svg`
      if (card.suit === 'dragon') return `MJ${dragonFileMap[card.rank]}.svg`
      if (suitFileMap[card.suit]) return `MJ${card.rank}${suitFileMap[card.suit]}.svg`
      return null
    }
    const suitFileMap = { bamboo: 'Sou', circles: 'Pin', characters: 'Man' }
    const windFileMap = { east: 'Ton', south: 'Nan', west: 'Shaa', north: 'Pei' }
    const dragonFileMap = { red: 'Chun', green: 'Hatsu', white: 'Haku' }
    if (card.suit === 'wind') return `${windFileMap[card.rank]}.svg`
    if (card.suit === 'dragon') return `${dragonFileMap[card.rank]}.svg`
    if (suitFileMap[card.suit]) return `${suitFileMap[card.suit]}${card.rank}.svg`
    return null
  },

  getBackPath() {
    return 'Back.svg'
  },

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
      })
    }

    return tiles
  },
})
