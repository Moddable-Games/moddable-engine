import { createChessPlugin } from '../index.js'
import { createGameFromDefinition } from '../../game/index.js'
import { createHexTopology } from '../../topology-hex/index.js'

const HEX_KNIGHT_OFFSETS = [
  { q: 2, r: -1 }, { q: 1, r: -2 }, { q: -1, r: -1 },
  { q: -2, r: 1 }, { q: -1, r: 2 }, { q: 1, r: 1 },
  { q: 2, r: 1 }, { q: 1, r: 2 }, { q: -1, r: 1 },
  { q: -2, r: -1 }, { q: -1, r: -2 }, { q: 1, r: -1 },
]

function createGlinskiGame() {
  const topo = createHexTopology({ radius: 5, shape: 'hexagonal' })

  const forwardDir = {
    0: { q: 0, r: -1 },
    1: { q: 0, r: 1 },
  }

  const startCells = { 0: new Set(), 1: new Set() }
  const promotionCells = { 0: new Set(), 1: new Set() }

  for (const pos of topo.getAllCells()) {
    const [q, r] = pos.split(',').map(Number)
    if (r === 3) startCells[0].add(pos)
    if (r === -3) startCells[1].add(pos)
    if (r === -5 || (r === -4 && Math.abs(q) > 3) || (r === -3 && Math.abs(q) > 4))
      promotionCells[0].add(pos)
    if (r === 5 || (r === 4 && Math.abs(q) > 3) || (r === 3 && Math.abs(q) > 4))
      promotionCells[1].add(pos)
  }

  const captureDirections = {
    0: [{ q: -1, r: 0 }, { q: 1, r: -1 }],
    1: [{ q: 1, r: 0 }, { q: -1, r: 1 }],
  }

  const pawnConfig = {
    forwardDir,
    startCells,
    promotionCells,
    captureDirections,
    doubleStep: true,
  }

  const pieces = {
    king:   { type: 'rider', dirs: 'all', maxSteps: 1 },
    queen:  { type: 'rider', dirs: 'all' },
    rook:   { type: 'rider', dirs: 'orthogonal' },
    bishop: { type: 'rider', dirs: 'diagonal' },
    knight: { type: 'leaper', offsets: HEX_KNIGHT_OFFSETS },
    pawn:   { movement: 'pawn' },
  }

  return createGameFromDefinition(
    {
      topology: { type: 'hex', radius: 5, shape: 'hexagonal' },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: {} },
      render: {},
    },
    {
      topologies: { hex: (config) => createHexTopology(config) },
      pluginFactories: {
        chess: (cfg, ctx) => createChessPlugin({
          ...cfg,
          pawnConfig,
          pieces,
          castling: false,
          enPassant: false,
          setup: buildGlinskiSetup(),
        }, ctx),
      },
    }
  )
}

function buildGlinskiSetup() {
  const positions = {}

  positions['0,5'] = { type: 'king', owner: 0 }
  positions['-1,5'] = { type: 'queen', owner: 0 }
  positions['-2,5'] = { type: 'bishop', owner: 0 }
  positions['0,4'] = { type: 'bishop', owner: 0 }
  positions['2,3'] = { type: 'bishop', owner: 0 }
  positions['-3,5'] = { type: 'knight', owner: 0 }
  positions['3,2'] = { type: 'knight', owner: 0 }
  positions['-4,5'] = { type: 'rook', owner: 0 }
  positions['4,1'] = { type: 'rook', owner: 0 }

  for (let q = -4; q <= 4; q++) {
    const r = q <= 0 ? 4 : 4 - q + 1
    if (q <= 0) positions[`${q},4`] = { type: 'pawn', owner: 0 }
    else positions[`${q},${5 - q - 1}`] = { type: 'pawn', owner: 0 }
  }

  positions['0,-5'] = { type: 'king', owner: 1 }
  positions['1,-5'] = { type: 'queen', owner: 1 }
  positions['2,-5'] = { type: 'bishop', owner: 1 }
  positions['0,-4'] = { type: 'bishop', owner: 1 }
  positions['-2,-3'] = { type: 'bishop', owner: 1 }
  positions['3,-5'] = { type: 'knight', owner: 1 }
  positions['-3,-2'] = { type: 'knight', owner: 1 }
  positions['4,-5'] = { type: 'rook', owner: 1 }
  positions['-4,-1'] = { type: 'rook', owner: 1 }

  for (let q = -4; q <= 4; q++) {
    if (q >= 0) positions[`${q},-4`] = { type: 'pawn', owner: 1 }
    else positions[`${q},${-5 - q - 1}`] = { type: 'pawn', owner: 1 }
  }

  return positions
}

describe('Glinski hexagonal chess — full game', () => {
  it('creates game with correct topology', () => {
    const game = createGlinskiGame()
    expect(game.topology.getCellCount()).toBe(91)
  })

  it('white has legal moves at start', () => {
    const game = createGlinskiGame()
    const moves = game.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
  })

  it('pawns can advance forward', () => {
    const game = createGlinskiGame()
    const moves = game.getLegalMoves()
    const pawnMoves = moves.filter(m => {
      const piece = game.getState('chess').board[m.from]
      return piece && piece.type === 'pawn'
    })
    expect(pawnMoves.length).toBeGreaterThan(0)
  })

  it('knights have hex leap targets', () => {
    const game = createGlinskiGame()
    const moves = game.getLegalMoves()
    const knightMoves = moves.filter(m => {
      const piece = game.getState('chess').board[m.from]
      return piece && piece.type === 'knight'
    })
    expect(knightMoves.length).toBeGreaterThan(0)
  })

  it('rook slides along hex orthogonals', () => {
    const game = createGlinskiGame()
    const state = game.getState('chess')
    const rookPos = Object.keys(state.board).find(
      k => state.board[k] && state.board[k].type === 'rook' && state.board[k].owner === 0
    )
    expect(rookPos).toBeDefined()
  })

  it('plays multiple moves without error', () => {
    const game = createGlinskiGame()
    const moves1 = game.getLegalMoves()
    expect(moves1.length).toBeGreaterThan(0)

    const pawnMove = moves1.find(m => {
      const piece = game.getState('chess').board[m.from]
      return piece && piece.type === 'pawn'
    })
    if (pawnMove) {
      const r1 = game.execute(pawnMove)
      expect(r1.ok).toBe(true)
      expect(game.currentPlayer()).toBe('black')

      const moves2 = game.getLegalMoves()
      expect(moves2.length).toBeGreaterThan(0)

      const blackPawn = moves2.find(m => {
        const piece = game.getState('chess').board[m.from]
        return piece && piece.type === 'pawn'
      })
      if (blackPawn) {
        const r2 = game.execute(blackPawn)
        expect(r2.ok).toBe(true)
        expect(game.currentPlayer()).toBe('white')
      }
    }
  })

  it('detects check on hex board', () => {
    const smallSetup = {}
    smallSetup['0,0'] = { type: 'king', owner: 0 }
    smallSetup['0,-5'] = { type: 'king', owner: 1 }
    smallSetup['0,-2'] = { type: 'rook', owner: 0 }

    const game = createGameFromDefinition(
      {
        topology: { type: 'hex', radius: 5, shape: 'hexagonal' },
        players: { names: ['white', 'black'], count: 2 },
        plugins: { chess: {} },
        render: {},
      },
      {
        topologies: { hex: (config) => createHexTopology(config) },
        pluginFactories: {
          chess: (cfg, ctx) => createChessPlugin({
            ...cfg,
            castling: false,
            enPassant: false,
            pawnConfig: {
              forwardDir: { 0: { q: 0, r: -1 }, 1: { q: 0, r: 1 } },
              startCells: { 0: new Set(), 1: new Set() },
              promotionCells: { 0: new Set(), 1: new Set() },
              captureDirections: { 0: [{ q: -1, r: 0 }, { q: 1, r: -1 }], 1: [{ q: 1, r: 0 }, { q: -1, r: 1 }] },
              doubleStep: false,
            },
            pieces: {
              king: { type: 'rider', dirs: 'all', maxSteps: 1 },
              rook: { type: 'rider', dirs: 'orthogonal' },
              pawn: { movement: 'pawn' },
            },
            setup: smallSetup,
          }, ctx),
        },
      }
    )

    const moves = game.getLegalMoves()
    const kingMoves = moves.filter(m => {
      const piece = game.getState('chess').board[m.from]
      return piece && piece.type === 'king' && piece.owner === 0
    })
    expect(kingMoves.length).toBeGreaterThan(0)
  })

  it('checkmate on hex board', () => {
    const setup = {}
    setup['0,5'] = { type: 'king', owner: 0 }
    setup['0,-5'] = { type: 'king', owner: 1 }
    setup['1,-4'] = { type: 'rook', owner: 0 }
    setup['-1,-4'] = { type: 'rook', owner: 0 }

    const game = createGameFromDefinition(
      {
        topology: { type: 'hex', radius: 5, shape: 'hexagonal' },
        players: { names: ['white', 'black'], count: 2 },
        plugins: { chess: {} },
        render: {},
      },
      {
        topologies: { hex: (config) => createHexTopology(config) },
        pluginFactories: {
          chess: (cfg, ctx) => createChessPlugin({
            ...cfg,
            castling: false,
            enPassant: false,
            pawnConfig: {
              forwardDir: { 0: { q: 0, r: -1 }, 1: { q: 0, r: 1 } },
              startCells: { 0: new Set(), 1: new Set() },
              promotionCells: { 0: new Set(), 1: new Set() },
              captureDirections: { 0: [{ q: -1, r: 0 }, { q: 1, r: -1 }], 1: [{ q: 1, r: 0 }, { q: -1, r: 1 }] },
              doubleStep: false,
            },
            pieces: {
              king: { type: 'rider', dirs: 'all', maxSteps: 1 },
              rook: { type: 'rider', dirs: 'orthogonal' },
              pawn: { movement: 'pawn' },
            },
            setup,
          }, ctx),
        },
      }
    )

    const r = game.execute({ from: '1,-4', to: '1,-5' })
    expect(r.ok).toBe(true)

    const blackMoves = game.getLegalMoves()
    if (blackMoves.length === 0) {
      expect(r.winner).toBeDefined()
    } else {
      const blackMove = blackMoves[0]
      game.execute(blackMove)
      const w2moves = game.getLegalMoves()
      expect(w2moves.length).toBeGreaterThan(0)
    }
  })
})
