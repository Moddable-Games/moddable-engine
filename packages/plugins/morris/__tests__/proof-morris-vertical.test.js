import { createGameFromDefinition } from '../../../game/index.js'
import { createGraphTopology } from '../../../topologies/graph/index.js'
import { createMorrisPlugin } from '../index.js'
import { createThemeResolver } from '../../../board-theme/index.js'
import { createBoardRenderer } from '../../../render/index.js'

const NINE_MENS_NODES = [
  'a1', 'a4', 'a7', 'b2', 'b4', 'b6', 'c3', 'c4', 'c5',
  'd1', 'd2', 'd3', 'd5', 'd6', 'd7',
  'e3', 'e4', 'e5', 'f2', 'f4', 'f6', 'g1', 'g4', 'g7',
]

const NINE_MENS_EDGES = [
  ['a1', 'a4'], ['a4', 'a7'], ['b2', 'b4'], ['b4', 'b6'],
  ['c3', 'c4'], ['c4', 'c5'], ['d1', 'd2'], ['d2', 'd3'],
  ['d5', 'd6'], ['d6', 'd7'], ['e3', 'e4'], ['e4', 'e5'],
  ['f2', 'f4'], ['f4', 'f6'], ['g1', 'g4'], ['g4', 'g7'],
  ['a1', 'd1'], ['d1', 'g1'], ['b2', 'd2'], ['d2', 'f2'],
  ['c3', 'd3'], ['d3', 'e3'], ['a4', 'b4'], ['b4', 'c4'],
  ['e4', 'f4'], ['f4', 'g4'], ['c5', 'd5'], ['d5', 'e5'],
  ['b6', 'd6'], ['d6', 'f6'], ['a7', 'd7'], ['d7', 'g7'],
]

const NINE_MENS_MILLS = [
  ['a1', 'a4', 'a7'], ['b2', 'b4', 'b6'], ['c3', 'c4', 'c5'],
  ['d1', 'd2', 'd3'], ['d5', 'd6', 'd7'], ['e3', 'e4', 'e5'],
  ['f2', 'f4', 'f6'], ['g1', 'g4', 'g7'],
  ['a1', 'd1', 'g1'], ['b2', 'd2', 'f2'], ['c3', 'd3', 'e3'],
  ['a4', 'b4', 'c4'], ['e4', 'f4', 'g4'], ['a7', 'd7', 'g7'],
  ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
]

const morrisDefinition = {
  topology: { type: 'graph', nodes: NINE_MENS_NODES, edges: NINE_MENS_EDGES },
  players: { names: ['player1', 'player2'], count: 2 },
  plugins: {
    morris: { piecesPerPlayer: 9, mills: NINE_MENS_MILLS },
  },
}

describe('proof: Morris full vertical', () => {
  let game

  beforeEach(() => {
    const themeResolver = createThemeResolver()

    game = createGameFromDefinition(morrisDefinition, {
      topologies: { graph: (config) => createGraphTopology(config) },
      pluginFactories: {
        morris: (cfg, ctx) => createMorrisPlugin(cfg, ctx),
      },
      boardTheme: themeResolver.resolve('classic'),
    })
  })

  describe('game creation', () => {
    it('creates graph topology with 24 nodes', () => {
      expect(game.topology).not.toBeNull()
      expect(game.topology.size).toBe(24)
    })

    it('topology has traversal methods', () => {
      expect(typeof game.topology.floodFill).toBe('function')
      expect(typeof game.topology.getGroup).toBe('function')
    })

    it('initialises morris state from topology nodes', () => {
      const state = game.getState('morris')
      expect(Object.keys(state.nodes)).toHaveLength(24)
      expect(state.phase).toBe('place')
      expect(state.piecesInHand).toEqual([9, 9])
    })
  })

  describe('placement phase', () => {
    it('places pieces on graph nodes', () => {
      game.execute({ action: 'place', coord: 'a1' })
      expect(game.getState('morris').nodes.a1).toBe('player1')
      expect(game.currentPlayer()).toBe('player2')
    })

    it('rejects placement on occupied node', () => {
      game.execute({ action: 'place', coord: 'a1' })
      const result = game.execute({ action: 'place', coord: 'a1' })
      expect(result.ok).toBe(false)
    })

    it('decrements pieces in hand', () => {
      game.execute({ action: 'place', coord: 'a1' })
      expect(game.getState('morris').piecesInHand[0]).toBe(8)
    })
  })

  describe('mill formation (continueTurn)', () => {
    it('forming a mill gives extra turn for removal', () => {
      game.execute({ action: 'place', coord: 'a1' }) // p1
      game.execute({ action: 'place', coord: 'd1' }) // p2
      game.execute({ action: 'place', coord: 'a4' }) // p1
      game.execute({ action: 'place', coord: 'd2' }) // p2
      const result = game.execute({ action: 'place', coord: 'a7' }) // p1 mills a1-a4-a7
      expect(result.continueTurn).toBe(true)
      expect(game.currentPlayer()).toBe('player1')
      expect(game.getState('morris').awaitingRemoval).toBe(true)
    })

    it('removal takes opponent piece then advances turn', () => {
      game.execute({ action: 'place', coord: 'a1' })
      game.execute({ action: 'place', coord: 'd1' })
      game.execute({ action: 'place', coord: 'a4' })
      game.execute({ action: 'place', coord: 'd2' })
      game.execute({ action: 'place', coord: 'a7' }) // mill

      game.execute({ action: 'remove', coord: 'd1' })
      expect(game.getState('morris').nodes.d1).toBeNull()
      expect(game.getState('morris').awaitingRemoval).toBe(false)
      expect(game.currentPlayer()).toBe('player2')
    })

    it('can only remove opponent pieces', () => {
      game.execute({ action: 'place', coord: 'a1' })
      game.execute({ action: 'place', coord: 'd1' })
      game.execute({ action: 'place', coord: 'a4' })
      game.execute({ action: 'place', coord: 'd2' })
      game.execute({ action: 'place', coord: 'a7' }) // mill

      const result = game.execute({ action: 'remove', coord: 'a1' })
      expect(result.ok).toBe(false) // can't remove own piece
    })
  })

  describe('movement phase with topology adjacency', () => {
    function setupMovePhase() {
      const nodes = {}
      for (const n of NINE_MENS_NODES) nodes[n] = null
      nodes.a1 = 'player1'; nodes.a4 = 'player1'; nodes.a7 = 'player1'
      nodes.b2 = 'player1'; nodes.b4 = 'player1'; nodes.b6 = 'player1'
      nodes.c3 = 'player1'; nodes.c4 = 'player1'; nodes.c5 = 'player1'
      nodes.d1 = 'player2'; nodes.d2 = 'player2'; nodes.d3 = 'player2'
      nodes.d5 = 'player2'; nodes.d6 = 'player2'; nodes.d7 = 'player2'
      nodes.e3 = 'player2'; nodes.e4 = 'player2'; nodes.e5 = 'player2'
      game.store.set('morris', {
        nodes, phase: 'move', piecesInHand: [0, 0], awaitingRemoval: false,
      }, 'morris')
    }

    it('allows movement to adjacent nodes', () => {
      setupMovePhase()
      // player1 at a1, adjacent to a4 and d1
      // a4 is occupied by player1, d1 by player2
      // Neither is empty — need a free adjacent node
      // b4 is adjacent to a4, b2, b6, c4 — b4 occupied by player1
      // Try c5 → d5 — c5 is player1, d5 is player2. Not empty.
      // Let's make a node empty
      const nodes = { ...game.getState('morris').nodes }
      nodes.g1 = null; nodes.g4 = null; nodes.g7 = null
      nodes.f2 = null; nodes.f4 = null; nodes.f6 = null
      game.store.set('morris', {
        ...game.getState('morris'), nodes,
      }, 'morris')

      // player1's c3 can move to d3 if d3 is empty
      nodes.d3 = null
      game.store.set('morris', { ...game.getState('morris'), nodes }, 'morris')

      const result = game.execute({ action: 'move', from: 'c3', to: 'd3' })
      expect(result.ok).toBe(true)
      expect(game.getState('morris').nodes.c3).toBeNull()
      expect(game.getState('morris').nodes.d3).toBe('player1')
    })

    it('rejects movement to non-adjacent node', () => {
      setupMovePhase()
      const nodes = { ...game.getState('morris').nodes }
      nodes.g7 = null
      game.store.set('morris', { ...game.getState('morris'), nodes }, 'morris')

      const result = game.execute({ action: 'move', from: 'a1', to: 'g7' })
      expect(result.ok).toBe(false) // not adjacent
    })
  })

  describe('flying (when down to 3 pieces)', () => {
    it('allows flying to any empty node', () => {
      const nodes = {}
      for (const n of NINE_MENS_NODES) nodes[n] = null
      nodes.a1 = 'player1'; nodes.a4 = 'player1'; nodes.a7 = 'player1'
      nodes.d1 = 'player2'; nodes.d2 = 'player2'; nodes.d3 = 'player2'
      nodes.d5 = 'player2'
      game.store.set('morris', {
        nodes, phase: 'move', piecesInHand: [0, 0], awaitingRemoval: false,
      }, 'morris')

      // player1 has 3 pieces — can fly
      const result = game.execute({ action: 'move', from: 'a1', to: 'g7' })
      expect(result.ok).toBe(true)
    })
  })

  describe('win detection', () => {
    it('wins when opponent has fewer than 3 pieces', () => {
      const nodes = {}
      for (const n of NINE_MENS_NODES) nodes[n] = null
      nodes.a1 = 'player1'; nodes.a4 = 'player1'; nodes.a7 = 'player1'
      nodes.b2 = 'player1'
      nodes.d1 = 'player2'; nodes.d2 = 'player2'
      // player2 has only 2 pieces — checkWin should trigger after any player1 move
      game.store.set('morris', {
        nodes, phase: 'move', piecesInHand: [0, 0], awaitingRemoval: false,
      }, 'morris')

      // player1 moves b2 to d2... but d2 is occupied.
      // Move b2 to b4 (adjacent: b2 -> b4)
      const result = game.execute({ action: 'move', from: 'b2', to: 'b4' })
      expect(result.ok).toBe(true)
      expect(result.winner).toBe('player1')
    })
  })

  describe('themed rendering', () => {
    it('produces SVG with graph layout', () => {
      game.execute({ action: 'place', coord: 'a1' })

      const layout = game.getLayout()
      const svg = createBoardRenderer().render(layout, { theme: game.boardTheme })
      expect(svg).toContain('<svg')
      expect(svg).toContain('circle')
    })
  })

  describe('variant: Six Men\'s Morris', () => {
    it('creates with fewer pieces', () => {
      const sixMens = createGameFromDefinition(
        { ...morrisDefinition, plugins: { morris: { piecesPerPlayer: 6, mills: NINE_MENS_MILLS } } },
        {
          topologies: { graph: (config) => createGraphTopology(config) },
          pluginFactories: { morris: (cfg) => createMorrisPlugin(cfg) },
        }
      )
      expect(sixMens.getState('morris').piecesInHand).toEqual([6, 6])
    })
  })
})
