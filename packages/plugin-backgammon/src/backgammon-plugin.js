export function createBackgammonPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    positions: 24,
    piecesPerPlayer: 15,
    bearOffThreshold: 15,
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

  let rng = null
  let dice = null

  const DEFAULT_SETUP = [
    { point: 0, owner: 0, count: 2 },
    { point: 5, owner: 1, count: 5 },
    { point: 7, owner: 1, count: 3 },
    { point: 11, owner: 0, count: 5 },
    { point: 12, owner: 1, count: 5 },
    { point: 16, owner: 0, count: 3 },
    { point: 18, owner: 0, count: 5 },
    { point: 23, owner: 1, count: 2 },
  ]

  function defaultInit(pluginConfig, { request }) {
    rng = request('core.rng')
    dice = request('component.dice')
    const setup = pluginConfig.setup || config.setup || DEFAULT_SETUP
    return {
      points: buildPoints(config.positions, setup),
      bar: { 0: 0, 1: 0 },
      borneOff: { 0: 0, 1: 0 },
      dice: [],
      movesRemaining: [],
    }
  }

  function buildPoints(numPositions, setup) {
    const points = new Array(numPositions).fill(null).map(() => ({ owner: null, count: 0 }))
    for (const { point, owner, count } of setup) {
      points[point] = { owner, count }
    }
    return points
  }

  function defaultValidateMove(move, slice, full) {
    if (move.action === 'roll') {
      return slice.dice.length === 0
    }
    if (move.action === 'move') {
      if (slice.movesRemaining.length === 0) return false
      const playerIdx = full.__players.currentIndex
      const from = move.from
      const to = move.to
      const die = move.die

      if (!slice.movesRemaining.includes(die)) return false

      if (slice.bar[playerIdx] > 0 && from !== 'bar') return false

      if (from === 'bar') {
        const target = slice.points[to]
        if (target.owner !== null && target.owner !== playerIdx && target.count > 1) return false
        return true
      }

      if (slice.points[from].owner !== playerIdx) return false
      if (slice.points[from].count <= 0) return false

      if (to === 'off') return true

      if (to < 0 || to >= config.positions) return false
      const target = slice.points[to]
      if (target.owner !== null && target.owner !== playerIdx && target.count > 1) return false

      return true
    }
    return false
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)

    if (move.action === 'roll') {
      let results
      if (move.d1 !== undefined && move.d2 !== undefined) {
        results = [move.d1, move.d2]
      } else if (dice && rng) {
        results = dice.roll(rng)
      } else if (rng) {
        results = [rng.nextInt(1, 6), rng.nextInt(1, 6)]
      } else {
        results = [3, 1]
      }
      const movesRemaining = dice ? dice.movesFromRoll(results) : (results[0] === results[1] ? [results[0], results[0], results[0], results[0]] : [...results])
      const newState = { ...slice, dice: results, movesRemaining }
      return { state: newState, continueTurn: true }
    }

    if (move.action === 'move') {
      const points = slice.points.map(p => ({ ...p }))
      const bar = { ...slice.bar }
      const borneOff = { ...slice.borneOff }
      const movesRemaining = [...slice.movesRemaining]
      const playerIdx = full.__players.currentIndex

      if (move.from === 'bar') {
        bar[playerIdx]--
      } else {
        points[move.from].count--
        if (points[move.from].count === 0) points[move.from].owner = null
      }

      if (move.to === 'off') {
        borneOff[playerIdx]++
      } else {
        const hit = hooks.captureEffect(move.to, points, bar, playerIdx)
        points[move.to].count++
        points[move.to].owner = playerIdx
      }

      movesRemaining.splice(movesRemaining.indexOf(move.die), 1)
      const dice = movesRemaining.length > 0 ? slice.dice : []

      const newState = { ...slice, points, bar, borneOff, dice, movesRemaining }
      const shouldContinue = hooks.continueTurn(newState, full)

      hooks.afterMove(move, newState, full)

      if (shouldContinue) {
        return { state: newState, continueTurn: true }
      }
      return newState
    }

    return slice
  }

  function defaultCaptureEffect(toPos, points, bar, playerIdx) {
    const target = points[toPos]
    if (target.owner !== null && target.owner !== playerIdx && target.count === 1) {
      bar[target.owner]++
      target.count = 0
      target.owner = null
      return true
    }
    return false
  }

  function defaultContinueTurn(slice) {
    return slice.movesRemaining.length > 0
  }

  function defaultGetLegalMoves(slice, full) {
    if (slice.dice.length === 0) return [{ action: 'roll' }]

    const moves = []
    const playerIdx = full.__players.currentIndex
    const direction = playerIdx === 0 ? 1 : -1

    if (slice.bar[playerIdx] > 0) {
      for (const die of [...new Set(slice.movesRemaining)]) {
        const to = playerIdx === 0 ? die - 1 : config.positions - die
        if (to >= 0 && to < config.positions) {
          const target = slice.points[to]
          if (target.owner === null || target.owner === playerIdx || target.count <= 1) {
            moves.push({ action: 'move', from: 'bar', to, die })
          }
        }
      }
    } else {
      for (const die of [...new Set(slice.movesRemaining)]) {
        for (let i = 0; i < config.positions; i++) {
          if (slice.points[i].owner !== playerIdx || slice.points[i].count <= 0) continue
          const to = i + die * direction
          if (to >= 0 && to < config.positions) {
            const target = slice.points[to]
            if (target.owner === null || target.owner === playerIdx || target.count <= 1) {
              moves.push({ action: 'move', from: i, to, die })
            }
          }
        }
      }
    }

    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice) {
    if (slice.borneOff[0] >= config.bearOffThreshold) return 'player1'
    if (slice.borneOff[1] >= config.bearOffThreshold) return 'player2'
    return null
  }

  function passthrough(moves) { return moves }
  function noop() {}

  return {
    sliceName: 'backgammon',
    pieceTypes: ['checker'],
    vocabulary: {
      checker: { symbols: { 0: 'W', 1: 'B', count: true } },
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
