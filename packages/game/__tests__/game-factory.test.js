import { createGame } from '../src/game-factory.js'
import { createGameFromDefinition } from '../src/create-game.js'
import { createTopologyRegistry } from '../src/topology-registry.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createGraphTopology } from '../../topology-graph/src/topology-graph.js'

const chessPlugin = {
  sliceName: 'chess',
  init() {
    const board = new Array(64).fill(null)
    board[48] = 'P'; board[0] = 'K'; board[63] = 'k'
    return { board, captured: [] }
  },
  validateMove(move, slice) { return slice.board[move.from] !== null },
  applyMove(move, slice) {
    const board = [...slice.board]
    const captured = [...slice.captured]
    if (board[move.to]) captured.push(board[move.to])
    board[move.to] = board[move.from]; board[move.from] = null
    return { board, captured }
  },
  getLegalMoves(slice) { return [] },
  checkWin(slice) {
    if (!slice.board.includes('K')) return 'black'
    if (!slice.board.includes('k')) return 'white'
    return null
  },
}

const goPlugin = {
  sliceName: 'go',
  init(config) {
    const size = config.size || 9
    return { board: new Array(size * size).fill(null), passes: 0, size }
  },
  validateMove(move, slice) {
    if (move.action === 'pass') return true
    return slice.board[move.coord] === null
  },
  applyMove(move, slice, full) {
    if (move.action === 'pass') return { ...slice, passes: slice.passes + 1 }
    const board = [...slice.board]
    board[move.coord] = full.__players.currentIndex === 0 ? 'black' : 'white'
    return { ...slice, board, passes: 0 }
  },
  getLegalMoves() { return [{ action: 'pass' }] },
  checkWin(slice) { return slice.passes >= 2 ? 'scoring' : null },
}

describe('createGame', () => {
  test('creates a playable chess instance', () => {
    const definition = {
      id: 'moddable-chess/standard',
      title: 'Standard Chess',
      family: 'moddable-chess',
      slug: 'standard',
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'] },
      plugins: { chess: {} },
      render: { tileSize: 56 },
    }

    const game = createGame(definition, {
      plugins: [chessPlugin],
      topologyFactory: createGridTopology,
    })

    expect(game.currentPlayer()).toBe('white')
    expect(game.topology.size).toBe(64)
    const result = game.execute({ from: 48, to: 40 })
    expect(result.ok).toBe(true)
    expect(game.getState('chess').board[40]).toBe('P')
    expect(game.currentPlayer()).toBe('black')
  })

  test('creates a playable go instance', () => {
    const definition = {
      id: 'go/standard',
      title: 'Go',
      family: 'go',
      slug: 'standard',
      topology: { type: 'grid', rows: 9, cols: 9 },
      players: { names: ['black', 'white'] },
      plugins: { go: { size: 9 } },
      render: {},
    }

    const game = createGame(definition, {
      plugins: [goPlugin],
      topologyFactory: createGridTopology,
    })

    expect(game.currentPlayer()).toBe('black')
    game.execute({ coord: 40 })
    expect(game.getState('go').board[40]).toBe('black')
    expect(game.currentPlayer()).toBe('white')
  })

  test('undo works through game instance', () => {
    const definition = {
      id: 'go/standard',
      title: 'Go',
      family: 'go',
      slug: 'standard',
      topology: { type: 'grid', rows: 9, cols: 9 },
      players: { names: ['black', 'white'] },
      plugins: { go: { size: 9 } },
      render: {},
    }

    const game = createGame(definition, {
      plugins: [goPlugin],
      topologyFactory: createGridTopology,
    })

    game.execute({ coord: 40 })
    expect(game.getState('go').board[40]).toBe('black')
    game.undo()
    expect(game.getState('go').board[40]).toBeNull()
  })

  test('getLayout returns topology layout', () => {
    const definition = {
      id: 'moddable-chess/standard',
      title: 'Chess',
      family: 'moddable-chess',
      slug: 'standard',
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'] },
      plugins: { chess: {} },
      render: { tileSize: 56, alternating: true },
    }

    const game = createGame(definition, {
      plugins: [chessPlugin],
      topologyFactory: createGridTopology,
    })

    const layout = game.getLayout()
    expect(layout.getDimensions()).toEqual({ width: 448, height: 448 })
    expect(layout.getCells()).toHaveLength(64)
  })

  test('works without topology (card game)', () => {
    const cardPlugin = {
      sliceName: 'cards',
      init() { return { hand: ['A', 'B', 'C'] } },
      validateMove(move, slice) { return slice.hand.includes(move.card) },
      applyMove(move, slice) { return { hand: slice.hand.filter(c => c !== move.card) } },
      getLegalMoves(slice) { return slice.hand.map(card => ({ card })) },
      checkWin(slice) { return slice.hand.length === 0 ? 'player1' : null },
    }

    const definition = {
      id: 'cards/test',
      title: 'Card Test',
      family: 'cards',
      slug: 'test',
      players: { names: ['player1', 'player2'] },
      plugins: { cards: {} },
      render: {},
    }

    const game = createGame(definition, { plugins: [cardPlugin] })
    expect(game.topology).toBeNull()
    expect(game.getLayout()).toBeNull()
    game.execute({ card: 'A' })
    expect(game.getState('cards').hand).toEqual(['B', 'C'])
  })

  test('provides RNG via seed', () => {
    const rngPlugin = {
      sliceName: 'rng-test',
      init(config, { request }) {
        const rng = request('core.rng')
        return { value: rng ? rng.nextInt(1, 100) : -1 }
      },
      validateMove() { return true },
      applyMove(move, slice) { return slice },
      getLegalMoves() { return [{}] },
      checkWin() { return null },
    }

    const definition = {
      id: 'test/rng',
      title: 'RNG Test',
      family: 'test',
      slug: 'rng',
      players: { names: ['p1'] },
      plugins: { 'rng-test': {} },
      render: {},
    }

    const game = createGame(definition, { plugins: [rngPlugin], rngSeed: 42 })
    expect(game.getState('rng-test').value).toBeGreaterThan(0)
  })
})

describe('createTopologyRegistry', () => {
  test('registers and creates topologies', () => {
    const reg = createTopologyRegistry()
    reg.register('grid', createGridTopology)
    reg.register('pit', createPitTopology)

    const grid = reg.create({ type: 'grid', rows: 8, cols: 8 })
    expect(grid.size).toBe(64)

    const pit = reg.create({ type: 'pit', pitsPerSide: 6 })
    expect(pit.totalPits).toBe(12)
  })

  test('throws for unregistered type', () => {
    const reg = createTopologyRegistry()
    expect(() => reg.create({ type: 'unknown' })).toThrow('No topology factory')
  })

  test('lists registered types', () => {
    const reg = createTopologyRegistry()
    reg.register('grid', createGridTopology)
    reg.register('hex', createHexTopology)
    expect(reg.getTypes().sort()).toEqual(['grid', 'hex'])
  })
})

describe('createGameFromDefinition', () => {
  test('wires topology from registry by type', () => {
    const definition = {
      id: 'go/standard',
      title: 'Go',
      family: 'go',
      slug: 'standard',
      topology: { type: 'grid', rows: 9, cols: 9 },
      players: { names: ['black', 'white'] },
      plugins: { go: { size: 9 } },
      render: {},
    }

    const game = createGameFromDefinition(definition, {
      plugins: [goPlugin],
      topologies: { grid: createGridTopology, hex: createHexTopology },
    })

    expect(game.topology.size).toBe(81)
    game.execute({ coord: 0 })
    expect(game.getState('go').board[0]).toBe('black')
  })

  test('works with graph topology for morris', () => {
    const morrisPlugin = {
      sliceName: 'morris',
      init() {
        return { nodes: { a1: null, a4: null, d1: null }, phase: 'place' }
      },
      validateMove(move, slice) { return slice.nodes[move.coord] === null },
      applyMove(move, slice, full) {
        const nodes = { ...slice.nodes }
        nodes[move.coord] = full.__players.currentIndex === 0 ? 'p1' : 'p2'
        return { ...slice, nodes }
      },
      getLegalMoves(slice) {
        return Object.entries(slice.nodes).filter(([,v]) => !v).map(([coord]) => ({ coord }))
      },
      checkWin() { return null },
    }

    const definition = {
      id: 'morris/nine-mens',
      title: 'Nine Mens Morris',
      family: 'morris',
      slug: 'nine-mens',
      topology: {
        type: 'graph',
        nodes: ['a1', 'a4', 'd1'],
        edges: [['a1', 'a4'], ['a1', 'd1']],
      },
      players: { names: ['p1', 'p2'] },
      plugins: { morris: {} },
      render: {},
    }

    const game = createGameFromDefinition(definition, {
      plugins: [morrisPlugin],
      topologies: { graph: createGraphTopology },
    })

    expect(game.topology.size).toBe(3)
    expect(game.topology.neighbours('a1').sort()).toEqual(['a4', 'd1'])
    game.execute({ coord: 'a1' })
    expect(game.getState('morris').nodes.a1).toBe('p1')
  })
})
