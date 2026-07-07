import { createSeededRng } from '../hex-games/xorshift.js'
import { getDeckConfig } from './deck-registry.js'

export function createDeck(deckType, opts = {}) {
  const config = getDeckConfig(deckType)
  if (!config) throw new Error(`Unknown deck type: ${deckType}`)
  return config.create(opts)
}

export function shuffle(cards, seed) {
  const rng = createSeededRng(seed)
  const shuffled = cards.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.abs(rng.next()) % (i + 1)
    const tmp = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = tmp
  }
  return shuffled
}

export function deal(cards, dealSpec) {
  const { players, perPlayer, community = 0, remainder = 'draw' } = dealSpec
  const result = {
    hands: Array.from({ length: players }, () => []),
    community: [],
    drawPile: [],
  }

  let idx = 0

  if (perPlayer === 'all') {
    const each = Math.floor(cards.length / players)
    for (let p = 0; p < players; p++) {
      result.hands[p] = cards.slice(idx, idx + each)
      idx += each
    }
  } else {
    const count = typeof perPlayer === 'number' ? perPlayer : 0
    for (let round = 0; round < count; round++) {
      for (let p = 0; p < players; p++) {
        if (idx < cards.length) {
          result.hands[p].push(cards[idx++])
        }
      }
    }
  }

  if (community > 0) {
    result.community = cards.slice(idx, idx + community)
    idx += community
  }

  if (remainder === 'field') {
    result.community = result.community.concat(cards.slice(idx))
  } else {
    result.drawPile = cards.slice(idx)
  }

  return result
}
