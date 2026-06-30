export function createGoPlugin(variantConfig = {}, context = {}) {
  const { definition } = context

  const defaults = {
    komi: 6.5,
    scoring: 'territory',
    suicideAllowed: false,
    superko: false,
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
    continueTurn: () => false,
    turnAdvancement: null,
    beforeMove: noop,
    afterMove: noop,
    ...variantConfig.hooks,
  }

  let topology = null

  function defaultInit(pluginConfig, { request }) {
    topology = request('core.topology')
    let boardSize
    if (topology) {
      boardSize = topology.size
    } else {
      const dim = pluginConfig.size || 19
      boardSize = dim * dim
    }
    return {
      board: new Array(boardSize).fill(null),
      passes: 0,
      ko: null,
      captures: { 0: 0, 1: 0 },
      komi: config.komi,
      scoring: config.scoring,
      previousStates: config.superko ? [] : null,
    }
  }

  function defaultValidateMove(move, slice, full) {
    if (move.action === 'pass') return true
    if (move.action === 'resign') return true

    const coord = move.coord
    if (coord < 0 || coord >= slice.board.length) return false
    if (slice.board[coord] !== null) return false
    if (coord === slice.ko) return false

    if (!config.suicideAllowed) {
      if (wouldBeSuicide(coord, slice, full)) return false
    }

    return true
  }

  function defaultApplyMove(move, slice, full) {
    const result = hooks.beforeMove(move, slice, full)
    if (result !== undefined) slice = result

    if (move.action === 'pass') {
      return { ...slice, passes: slice.passes + 1, ko: null }
    }

    if (move.action === 'resign') {
      return slice
    }

    const board = [...slice.board]
    const playerIndex = full.__players.currentIndex
    const currentColour = playerIndex === 0 ? 'black' : 'white'
    const opponentColour = currentColour === 'black' ? 'white' : 'black'

    board[move.coord] = currentColour

    const captured = hooks.captureEffect(move.coord, board, opponentColour, slice)
    const captureCount = captured.length
    const captures = { ...slice.captures }
    captures[playerIndex] = (captures[playerIndex] || 0) + captureCount

    const ko = determineKo(captured, move.coord, board)

    let previousStates = slice.previousStates
    if (config.superko && previousStates) {
      previousStates = [...previousStates, boardKey(slice.board)]
    }

    const newSlice = {
      ...slice,
      board,
      passes: 0,
      ko,
      captures,
      previousStates,
    }

    hooks.afterMove(move, newSlice, full)
    return newSlice
  }

  function defaultCaptureEffect(coord, board, opponentColour, slice) {
    const captured = []
    const neighbours = topology ? topology.neighbours(coord) : gridNeighbours(coord, slice)

    for (const n of neighbours) {
      if (board[n] === opponentColour) {
        if (!hasLiberties(n, board, slice)) {
          const { group } = getGroupCells(n, board, slice)
          for (const s of group) {
            board[s] = null
            captured.push(s)
          }
        }
      }
    }
    return captured
  }

  function defaultGetLegalMoves(slice, full) {
    const moves = [{ action: 'pass' }]
    for (let i = 0; i < slice.board.length; i++) {
      if (slice.board[i] === null && i !== slice.ko) {
        if (!config.suicideAllowed) {
          if (!wouldBeSuicide(i, slice, full)) {
            moves.push({ coord: i })
          }
        } else {
          moves.push({ coord: i })
        }
      }
    }
    return hooks.moveFilter(moves, slice, full)
  }

  function defaultCheckWin(slice, full) {
    if (slice.passes >= 2) return 'scoring'
    return null
  }

  function passthrough(moves) { return moves }
  function noop() {}

  function wouldBeSuicide(coord, slice, full) {
    const board = [...slice.board]
    const playerIndex = full.__players.currentIndex
    const currentColour = playerIndex === 0 ? 'black' : 'white'
    const opponentColour = currentColour === 'black' ? 'white' : 'black'

    board[coord] = currentColour

    const neighbours = topology ? topology.neighbours(coord) : gridNeighbours(coord, slice)
    for (const n of neighbours) {
      if (board[n] === opponentColour) {
        if (!hasLibertiesOnBoard(n, board, slice)) {
          return false
        }
      }
    }

    return !hasLibertiesOnBoard(coord, board, slice)
  }

  function hasLiberties(coord, board, slice) {
    return hasLibertiesOnBoard(coord, board, slice)
  }

  function hasLibertiesOnBoard(coord, board, slice) {
    const colour = board[coord]
    if (!colour) return true
    const visited = new Set()
    const stack = [coord]
    while (stack.length > 0) {
      const pos = stack.pop()
      if (visited.has(pos)) continue
      visited.add(pos)
      const neighbours = topology ? topology.neighbours(pos) : gridNeighbours(pos, slice)
      for (const n of neighbours) {
        if (board[n] === null) return true
        if (board[n] === colour && !visited.has(n)) stack.push(n)
      }
    }
    return false
  }

  function getGroupCells(coord, board, slice) {
    const colour = board[coord]
    if (!colour) return { group: new Set(), boundary: new Set() }

    if (topology && topology.getGroup) {
      return topology.getGroup(coord, c => board[c] === colour)
    }

    const group = new Set()
    const boundary = new Set()
    const stack = [coord]
    group.add(coord)
    while (stack.length > 0) {
      const pos = stack.pop()
      const neighbours = gridNeighbours(pos, slice)
      for (const n of neighbours) {
        if (group.has(n)) continue
        if (board[n] === colour) {
          group.add(n)
          stack.push(n)
        } else {
          boundary.add(n)
        }
      }
    }
    return { group, boundary }
  }

  function gridNeighbours(idx, slice) {
    const size = Math.round(Math.sqrt(slice.board.length))
    const row = Math.floor(idx / size)
    const col = idx % size
    const n = []
    if (row > 0) n.push(idx - size)
    if (row < size - 1) n.push(idx + size)
    if (col > 0) n.push(idx - 1)
    if (col < size - 1) n.push(idx + 1)
    return n
  }

  function determineKo(captured, playedCoord, board) {
    if (captured.length !== 1) return null
    return captured[0]
  }

  function boardKey(board) {
    return board.map(c => c === null ? '.' : c[0]).join('')
  }

  return {
    sliceName: 'go',
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
