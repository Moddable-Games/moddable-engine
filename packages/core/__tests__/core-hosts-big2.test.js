import { createRegistry } from '../src/plugin-registry.js'
import { createStore } from '../src/state-store.js'
import { createHistory } from '../src/history.js'
import { createPlayerSystem } from '../src/player-system.js'
import { createEventBus } from '../src/event-bus.js'
import { createPipeline } from '../src/move-pipeline.js'
import { createRng } from '../src/rng.js'

const SUITS = ['D', 'C', 'H', 'S']
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']

function makeDeck() {
  const deck = []
  for (const s of SUITS) for (const r of RANKS) deck.push(`${s}-${r}`)
  return deck
}

function cardRank(card) {
  const rank = card.split('-')[1]
  return RANKS.indexOf(rank)
}

function cardValue(card) {
  const suit = card.split('-')[0]
  return cardRank(card) * 4 + SUITS.indexOf(suit)
}

function beatsSingle(played, last) {
  return cardValue(played[0]) > cardValue(last[0])
}

const big2Plugin = {
  sliceName: 'big2',
  init(config, { request }) {
    const rng = request('core.rng')
    const deck = rng.shuffle(makeDeck())
    return {
      hands: [deck.slice(0, 13), deck.slice(13, 26), deck.slice(26, 39), deck.slice(39, 52)],
      lastPlay: null,
      lastPlayer: null,
      consecutivePasses: 0,
    }
  },
  validateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    if (move.action === 'pass') {
      return slice.lastPlayer !== playerIdx
    }
    if (move.action === 'play') {
      const hand = slice.hands[playerIdx]
      if (!move.cards.every(c => hand.includes(c))) return false
      if (slice.lastPlay === null) return true
      if (move.cards.length !== slice.lastPlay.length) return false
      if (move.cards.length === 1) return beatsSingle(move.cards, slice.lastPlay)
      return true
    }
    return false
  },
  applyMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    if (move.action === 'pass') {
      const cp = slice.consecutivePasses + 1
      if (cp >= 3) {
        return { ...slice, lastPlay: null, lastPlayer: null, consecutivePasses: 0 }
      }
      return { ...slice, consecutivePasses: cp }
    }
    const hands = slice.hands.map((h, i) => i === playerIdx ? h.filter(c => !move.cards.includes(c)) : [...h])
    return { hands, lastPlay: move.cards, lastPlayer: playerIdx, consecutivePasses: 0 }
  },
  getLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const moves = []
    if (slice.lastPlayer !== playerIdx) moves.push({ action: 'pass' })
    const hand = slice.hands[playerIdx]
    for (const card of hand) {
      if (slice.lastPlay === null || (slice.lastPlay.length === 1 && beatsSingle([card], slice.lastPlay))) {
        moves.push({ action: 'play', cards: [card] })
      }
    }
    return moves
  },
  checkWin(slice) {
    const empty = slice.hands.findIndex(h => h.length === 0)
    return empty >= 0 ? `player${empty + 1}` : null
  },
}

describe('proof: big2', () => {
  let pipeline, store, history, playerSystem, eventBus

  beforeEach(() => {
    const registry = createRegistry()
    const rng = createRng(77)
    registry.provide('core.rng', rng)
    registry.register(big2Plugin)
    playerSystem = createPlayerSystem({ players: ['player1', 'player2', 'player3', 'player4'] })
    store = createStore({})
    registry.initAll({ big2: {} }, store)
    store.set(playerSystem.sliceName, playerSystem.initState())
    history = createHistory()
    eventBus = createEventBus()
    pipeline = createPipeline(registry, store, history, playerSystem, eventBus)
  })

  test('4 players, 13 cards each', () => {
    const state = store.get('big2')
    expect(state.hands).toHaveLength(4)
    for (const hand of state.hands) {
      expect(hand).toHaveLength(13)
    }
  })

  test('all 52 cards dealt', () => {
    const state = store.get('big2')
    const all = state.hands.flat()
    expect(new Set(all).size).toBe(52)
  })

  test('play removes card from hand', () => {
    const hand = store.get('big2').hands[0]
    const card = hand[0]
    pipeline.execute({ action: 'play', cards: [card] })
    expect(store.get('big2').hands[0]).not.toContain(card)
  })

  test('4-player rotation', () => {
    expect(playerSystem.current(store)).toBe('player1')
    const card = store.get('big2').hands[0][0]
    pipeline.execute({ action: 'play', cards: [card] })
    expect(playerSystem.current(store)).toBe('player2')
  })

  test('pass increments consecutivePasses', () => {
    const card = store.get('big2').hands[0][0]
    pipeline.execute({ action: 'play', cards: [card] })
    pipeline.execute({ action: 'pass' })
    expect(store.get('big2').consecutivePasses).toBe(1)
  })

  test('3 passes resets lastPlay', () => {
    const card = store.get('big2').hands[0][0]
    pipeline.execute({ action: 'play', cards: [card] })
    pipeline.execute({ action: 'pass' })
    pipeline.execute({ action: 'pass' })
    pipeline.execute({ action: 'pass' })
    expect(store.get('big2').lastPlay).toBeNull()
  })

  test('cannot play lower card', () => {
    const state = store.get('big2')
    const sortedHand0 = [...state.hands[0]].sort((a, b) => cardValue(b) - cardValue(a))
    const highCard = sortedHand0[0]
    pipeline.execute({ action: 'play', cards: [highCard] })

    const hand1 = state.hands[1]
    const lowCard = [...hand1].sort((a, b) => cardValue(a) - cardValue(b))[0]
    if (cardValue(lowCard) <= cardValue(highCard)) {
      const result = pipeline.execute({ action: 'play', cards: [lowCard] })
      expect(result.ok).toBe(false)
    }
  })

  test('win when hand is empty', () => {
    const state = store.get('big2')
    store.set('big2', {
      ...state,
      hands: [['S-2'], state.hands[1], state.hands[2], state.hands[3]],
      lastPlay: null,
      lastPlayer: null,
      consecutivePasses: 0,
    }, 'big2')
    const result = pipeline.execute({ action: 'play', cards: ['S-2'] })
    expect(result.winner).toBe('player1')
  })

  test('no topology: state is hands + cards only', () => {
    const state = store.get('big2')
    expect(state.hands).toBeDefined()
    expect(state.lastPlay).toBeDefined()
    expect(state).not.toHaveProperty('board')
    expect(state).not.toHaveProperty('cells')
    expect(state).not.toHaveProperty('nodes')
  })

  test('seeded shuffle is deterministic', () => {
    const registry2 = createRegistry()
    registry2.provide('core.rng', createRng(77))
    registry2.register(big2Plugin)
    const store2 = createStore({})
    registry2.initAll({ big2: {} }, store2)
    expect(store2.get('big2').hands).toEqual(store.get('big2').hands)
  })

  test('undo restores played card to hand', () => {
    const card = store.get('big2').hands[0][0]
    pipeline.execute({ action: 'play', cards: [card] })
    history.undo(store)
    expect(store.get('big2').hands[0]).toContain(card)
  })
})
