export function createHexPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    swapRule: false,
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

  let topology = null

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')
    const boardSize = topology ? topology.boardSize : (pluginConfig.size || 11)
    return {
      cells: {},
      boardSize,
      swapAvailable: config.swapRule,
      moveCount: 0,
    }
  }

  function defaultValidateMove(move, slice, full) {
    if (move.action === 'swap') {
      return slice.swapAvailable && slice.moveCount === 1
    }
    if (move.action === 'resign') return true

    const coord = coordKey(move)
    if (!isOnBoard(coord, slice)) return false
    return slice.cells[coord] === undefined
  }

  function defaultApplyMove(move, slice, full) {
    hooks.beforeMove(move, slice, full)

    if (move.action === 'resign') {
      return slice
    }

    if (move.action === 'swap') {
      const swapped = {}
      for (const [k, v] of Object.entries(slice.cells)) {
        swapped[k] = v === 'black' ? 'white' : 'black'
      }
      return {
        ...slice,
        cells: swapped,
        swapAvailable: false,
        moveCount: slice.moveCount + 1,
      }
    }

    const coord = coordKey(move)
    const playerIndex = full.__players.currentIndex
    const colour = playerIndex === 0 ? 'black' : 'white'

    const newSlice = {
      ...slice,
      cells: { ...slice.cells, [coord]: colour },
      moveCount: slice.moveCount + 1,
      swapAvailable: config.swapRule && slice.moveCount === 0,
    }

    hooks.afterMove(move, newSlice, full)
    return newSlice
  }

  function defaultGetLegalMoves(slice, full) {
    const moves = []

    if (topology) {
      for (const cell of topology.getAllCells()) {
        if (slice.cells[cell] === undefined) {
          moves.push({ coord: cell })
        }
      }
    } else {
      for (let q = 0; q < slice.boardSize; q++) {
        for (let r = 0; r < slice.boardSize; r++) {
          const k = `${q},${r}`
          if (slice.cells[k] === undefined) {
            moves.push({ q, r })
          }
        }
      }
    }

    if (slice.swapAvailable && slice.moveCount === 1) {
      moves.push({ action: 'swap' })
    }

    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice, full) {
    const playerIndex = full.__players.currentIndex
    const colour = playerIndex === 0 ? 'black' : 'white'

    if (hasConnection(slice, colour)) return colour
    return null
  }

  function hasConnection(slice, colour) {
    const boardSize = slice.boardSize
    const ownedCells = Object.entries(slice.cells)
      .filter(([, v]) => v === colour)
      .map(([k]) => k)

    if (ownedCells.length < boardSize) return false

    const startEdge = colour === 'black'
      ? (k) => { const q = parseInt(k.split(',')[0]); return q === 0 }
      : (k) => { const r = parseInt(k.split(',')[1]); return r === 0 }

    const endEdge = colour === 'black'
      ? (k) => { const q = parseInt(k.split(',')[0]); return q === boardSize - 1 }
      : (k) => { const r = parseInt(k.split(',')[1]); return r === boardSize - 1 }

    const starts = ownedCells.filter(startEdge)
    if (starts.length === 0) return false

    if (topology && topology.hasPath) {
      return topology.hasPath(
        new Set(starts),
        endEdge,
        (c) => slice.cells[c] === colour
      )
    }

    const visited = new Set()
    const stack = [...starts]
    while (stack.length > 0) {
      const current = stack.pop()
      if (visited.has(current)) continue
      visited.add(current)
      if (endEdge(current)) return true

      const neighbours = getNeighboursFallback(current)
      for (const n of neighbours) {
        if (slice.cells[n] === colour && !visited.has(n)) {
          stack.push(n)
        }
      }
    }
    return false
  }

  function getNeighboursFallback(coordStr) {
    const [q, r] = coordStr.split(',').map(Number)
    return [
      `${q+1},${r}`, `${q-1},${r}`,
      `${q},${r+1}`, `${q},${r-1}`,
      `${q+1},${r-1}`, `${q-1},${r+1}`,
    ]
  }

  function coordKey(move) {
    if (move.coord) return move.coord
    return `${move.q},${move.r}`
  }

  function isOnBoard(coord, slice) {
    if (topology) return topology.isValid(coord)
    const [q, r] = coord.split(',').map(Number)
    return q >= 0 && q < slice.boardSize && r >= 0 && r < slice.boardSize
  }

  function passthrough(moves) { return moves }
  function noop() {}

  return {
    sliceName: 'hex',
    pieceTypes: ['stone'],
    vocabulary: {
      stone: { symbols: { 0: 'X', 1: 'O' } },
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
