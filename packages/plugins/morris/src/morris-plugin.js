export function createMorrisPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    piecesPerPlayer: 9,
    flyingThreshold: 3,
    mills: null,
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
    continueTurn: defaultContinueTurn,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let topology = null
  let millPatterns = null

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')

    const nodeNames = topology
      ? topology.getNodes()
      : (pluginConfig.nodes || [])

    millPatterns = config.mills || pluginConfig.mills || []

    const nodes = {}
    for (const name of nodeNames) {
      nodes[name] = null
    }

    return {
      nodes,
      phase: 'place',
      piecesInHand: [config.piecesPerPlayer, config.piecesPerPlayer],
      awaitingRemoval: false,
    }
  }

  function defaultValidateMove(move, slice, full) {
    if (slice.awaitingRemoval) {
      if (move.action !== 'remove') return false
      const playerIdx = full.__players.currentIndex
      const opponent = playerIdx === 0 ? 'player2' : 'player1'
      return slice.nodes[move.coord] === opponent
    }

    if (slice.phase === 'place') {
      return move.action === 'place' && slice.nodes[move.coord] === null
    }

    if (move.action === 'move') {
      const playerIdx = full.__players.currentIndex
      const player = playerIdx === 0 ? 'player1' : 'player2'
      if (slice.nodes[move.from] !== player) return false
      if (slice.nodes[move.to] !== null) return false

      const playerPieces = Object.values(slice.nodes).filter(v => v === player).length
      if (config.flyingThreshold && playerPieces <= config.flyingThreshold) {
        return true
      }

      if (topology) {
        return topology.neighbours(move.from).includes(move.to)
      }
      return true
    }

    return false
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)

    const nodes = { ...slice.nodes }
    const piecesInHand = [...slice.piecesInHand]
    const playerIdx = full.__players.currentIndex
    const player = playerIdx === 0 ? 'player1' : 'player2'
    let phase = slice.phase

    if (move.action === 'remove') {
      nodes[move.coord] = null
      const newSlice = { ...slice, nodes, awaitingRemoval: false }
      hooks.afterMove(move, newSlice, full)
      return { state: newSlice, continueTurn: false }
    }

    if (move.action === 'place') {
      nodes[move.coord] = player
      piecesInHand[playerIdx]--
      if (piecesInHand[0] === 0 && piecesInHand[1] === 0) {
        phase = 'move'
      }
    }

    if (move.action === 'move') {
      nodes[move.from] = null
      nodes[move.to] = player
    }

    const formedMill = checkMillFormed(nodes, player)
    const newSlice = {
      ...slice,
      nodes,
      phase,
      piecesInHand,
      awaitingRemoval: formedMill,
    }

    hooks.afterMove(move, newSlice, full)

    const shouldContinue = hooks.continueTurn(formedMill, newSlice, full)
    if (shouldContinue) {
      return { state: newSlice, continueTurn: true }
    }
    return newSlice
  }

  function defaultContinueTurn(formedMill) {
    return formedMill
  }

  function checkMillFormed(nodes, player) {
    if (!millPatterns || millPatterns.length === 0) return false
    return millPatterns.some(mill =>
      mill.every(pos => nodes[pos] === player)
    )
  }

  function defaultGetLegalMoves(slice, full) {
    const playerIdx = full.__players.currentIndex
    const player = playerIdx === 0 ? 'player1' : 'player2'
    const opponent = playerIdx === 0 ? 'player2' : 'player1'

    if (slice.awaitingRemoval) {
      return Object.entries(slice.nodes)
        .filter(([, v]) => v === opponent)
        .map(([coord]) => ({ action: 'remove', coord }))
    }

    if (slice.phase === 'place') {
      return Object.entries(slice.nodes)
        .filter(([, v]) => v === null)
        .map(([coord]) => ({ action: 'place', coord }))
    }

    const moves = []
    const playerPieces = Object.values(slice.nodes).filter(v => v === player).length
    const canFly = config.flyingThreshold && playerPieces <= config.flyingThreshold

    for (const [coord, owner] of Object.entries(slice.nodes)) {
      if (owner !== player) continue
      if (canFly) {
        for (const [target, val] of Object.entries(slice.nodes)) {
          if (val === null) moves.push({ action: 'move', from: coord, to: target })
        }
      } else {
        const adj = topology ? topology.neighbours(coord) : []
        for (const target of adj) {
          if (slice.nodes[target] === null) {
            moves.push({ action: 'move', from: coord, to: target })
          }
        }
      }
    }

    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice, full) {
    if (slice.phase !== 'move') return null
    const playerIdx = full.__players.currentIndex
    const player = playerIdx === 0 ? 'player1' : 'player2'
    const opponent = playerIdx === 0 ? 'player2' : 'player1'

    const opponentPieces = Object.values(slice.nodes).filter(v => v === opponent).length
    if (opponentPieces < 3) return player

    const opponentMoves = getMovesForPlayer(slice, opponent)
    if (opponentMoves.length === 0) return player

    return null
  }

  function getMovesForPlayer(slice, player) {
    const moves = []
    const playerPieces = Object.values(slice.nodes).filter(v => v === player).length
    const canFly = config.flyingThreshold && playerPieces <= config.flyingThreshold

    for (const [coord, owner] of Object.entries(slice.nodes)) {
      if (owner !== player) continue
      if (canFly) {
        for (const [target, val] of Object.entries(slice.nodes)) {
          if (val === null) { moves.push(1); return moves }
        }
      } else {
        const adj = topology ? topology.neighbours(coord) : []
        for (const target of adj) {
          if (slice.nodes[target] === null) { moves.push(1); return moves }
        }
      }
    }
    return moves
  }

  function passthrough(moves) { return moves }
  function noop() {}

  return {
    sliceName: 'morris',
    pieceTypes: ['piece'],
    vocabulary: {
      piece: { symbols: { 0: 'W', 1: 'B' } },
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
