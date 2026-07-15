export function createBig2Plugin(variantConfig = {}, context = {}) {
  const defaults = {
    cardsPerPlayer: null,
    passesBeforeReset: 3,
  }

  const config = { ...defaults, ...variantConfig }

  const hooks = {
    init: defaultInit,
    validateMove: defaultValidateMove,
    applyMove: defaultApplyMove,
    getLegalMoves: defaultGetLegalMoves,
    checkWin: defaultCheckWin,
    moveFilter: passthrough,
    captureEffect: noop,
    continueTurn: () => false,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let deck = null
  let rng = null

  function defaultInit(pluginConfig, { request }) {
    rng = request('core.rng')
    deck = request('component.deck')

    const cards = rng ? rng.shuffle(deck.makeDeck()) : deck.makeDeck()
    const playerCount = pluginConfig.playerCount || 4
    const hands = deck.deal(cards, playerCount, config.cardsPerPlayer)

    return {
      hands,
      lastPlay: null,
      lastPlayer: null,
      consecutivePasses: 0,
    }
  }

  function defaultValidateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    if (move.action === 'pass') {
      return slice.lastPlayer !== playerIdx
    }
    if (move.action === 'play') {
      const hand = slice.hands[playerIdx]
      if (!move.cards.every(c => hand.includes(c))) return false
      if (slice.lastPlay === null) return true
      if (move.cards.length !== slice.lastPlay.length) return false
      return deck.beats(move.cards, slice.lastPlay)
    }
    return false
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)
    const playerIdx = full.__players.currentIndex

    if (move.action === 'pass') {
      const cp = slice.consecutivePasses + 1
      if (cp >= config.passesBeforeReset) {
        return { ...slice, lastPlay: null, lastPlayer: null, consecutivePasses: 0 }
      }
      return { ...slice, consecutivePasses: cp }
    }

    if (move.action === 'play') {
      const hands = slice.hands.map((h, i) =>
        i === playerIdx ? h.filter(c => !move.cards.includes(c)) : [...h]
      )
      const newSlice = {
        hands,
        lastPlay: move.cards,
        lastPlayer: playerIdx,
        consecutivePasses: 0,
      }
      hooks.afterMove(move, newSlice, full)
      return newSlice
    }

    return slice
  }

  function defaultGetLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const moves = []

    if (slice.lastPlayer !== playerIdx) {
      moves.push({ action: 'pass' })
    }

    const hand = slice.hands[playerIdx]
    for (const card of hand) {
      if (slice.lastPlay === null || deck.beats([card], slice.lastPlay)) {
        moves.push({ action: 'play', cards: [card] })
      }
    }

    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice) {
    const empty = slice.hands.findIndex(h => h.length === 0)
    if (empty >= 0) return `player${empty + 1}`
    return null
  }

  function passthrough(moves) { return moves }
  function noop() {}

  return {
    sliceName: 'big2',
    pieceTypes: ['card'],
    vocabulary: {
      card: { symbols: { notation: 'deck' } },
    },
    config,

    init(pluginConfig, capabilities) {
      return hooks.init(pluginConfig, capabilities)
    },

    validateMove(move, slice, full) {
      return hooks.validateMove(move, slice, full)
    },

    applyMove(move, slice, full) {
      return hooks.applyMove(move, slice, full)
    },

    getLegalMoves(slice, full) {
      return hooks.getLegalMoves(slice, full)
    },

    checkWin(slice, full) {
      return hooks.checkWin(slice, full)
    },
  }
}
