export function createMancalaPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    seeds: 4,
    captureRule: 'own-empty',
    lastSeedInStore: 'extra-turn',
    endgameCollection: 'remaining-to-owner',
  }

  const config = { ...defaults, ...variantConfig }

  const hooks = {
    init: defaultInit,
    validateMove: defaultValidateMove,
    applyMove: defaultApplyMove,
    getLegalMoves: defaultGetLegalMoves,
    checkWin: defaultCheckWin,
    moveFilter: passthrough,
    captureEffect: defaultCaptureEffect,
    continueTurn: defaultContinueTurn,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let topology = null

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')
    const pitsPerSide = topology ? topology.pitsPerSide : (pluginConfig.pitsPerSide || 6)
    const totalPits = pitsPerSide * 2
    return {
      pits: new Array(totalPits).fill(config.seeds),
      stores: [0, 0],
      pitsPerSide,
      totalPits,
      lastLanding: null,
    }
  }

  function defaultValidateMove(move, slice, full) {
    const playerIdx = full.__players.currentIndex
    const start = playerIdx * slice.pitsPerSide
    const end = start + slice.pitsPerSide
    if (move.pit < start || move.pit >= end) return false
    return slice.pits[move.pit] > 0
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)

    const pits = [...slice.pits]
    const stores = [...slice.stores]
    const playerIdx = full.__players.currentIndex

    let seeds = pits[move.pit]
    pits[move.pit] = 0

    let pos = move.pit
    let sowPath
    if (topology) {
      sowPath = topology.sowSequence(move.pit, playerIdx)
    } else {
      sowPath = simpleSowSequence(move.pit, slice.totalPits)
    }

    let sowIdx = 0
    while (seeds > 0) {
      pos = sowPath[sowIdx % sowPath.length]
      if (topology && topology.isStore(pos)) {
        stores[topology.getOwner(pos)]++
      } else {
        pits[pos]++
      }
      seeds--
      sowIdx++
    }

    const landedInStore = topology ? topology.isStore(pos) : false

    const captured = hooks.captureEffect(pos, pits, stores, playerIdx, slice)

    const newSlice = {
      ...slice,
      pits: captured ? captured.pits : pits,
      stores: captured ? captured.stores : stores,
      lastLanding: pos,
    }

    const shouldContinue = hooks.continueTurn(pos, landedInStore, newSlice, full)

    hooks.afterMove(move, newSlice, full)

    if (shouldContinue) {
      return { state: newSlice, continueTurn: true }
    }
    return newSlice
  }

  function defaultCaptureEffect(landingPos, pits, stores, playerIdx, slice) {
    if (config.captureRule === 'none') return null
    if (config.captureRule !== 'own-empty') return null

    const start = playerIdx * slice.pitsPerSide
    const end = start + slice.pitsPerSide

    if (landingPos < start || landingPos >= end) return null
    if (pits[landingPos] !== 1) return null

    const opposite = slice.totalPits - 1 - landingPos
    if (pits[opposite] <= 0) return null

    const newPits = [...pits]
    const newStores = [...stores]
    newStores[playerIdx] += newPits[opposite] + 1
    newPits[landingPos] = 0
    newPits[opposite] = 0

    return { pits: newPits, stores: newStores }
  }

  function defaultContinueTurn(landingPos, landedInStore, slice, full) {
    if (config.lastSeedInStore === 'extra-turn' && landedInStore) {
      return true
    }
    return false
  }

  function defaultGetLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const start = playerIdx * slice.pitsPerSide
    const end = start + slice.pitsPerSide
    const moves = []
    for (let i = start; i < end; i++) {
      if (slice.pits[i] > 0) moves.push({ pit: i })
    }
    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice) {
    const half = slice.pitsPerSide
    const side1 = slice.pits.slice(0, half).reduce((a, b) => a + b, 0)
    const side2 = slice.pits.slice(half).reduce((a, b) => a + b, 0)

    if (side1 === 0 || side2 === 0) {
      let total1 = slice.stores[0]
      let total2 = slice.stores[1]

      if (config.endgameCollection === 'remaining-to-owner') {
        total1 += side1
        total2 += side2
      }

      if (total1 > total2) return 'player1'
      if (total2 > total1) return 'player2'
      return 'draw'
    }
    return null
  }

  function simpleSowSequence(fromPit, totalPits) {
    const seq = []
    for (let i = 1; i < totalPits; i++) {
      seq.push((fromPit + i) % totalPits)
    }
    return seq
  }

  function passthrough(moves) { return moves }
  function noop() {}

  return {
    sliceName: 'mancala',
    pieceTypes: ['seed'],
    vocabulary: {
      seed: { symbols: { count: true } },
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
