import { createMorrisPlugin } from '../index.js'
import { createGameFromDefinition } from '../../../game/index.js'
import { createGraphTopology } from '../../../topology-graph/index.js'

const NODES = [
  'a1', 'a4', 'a7', 'b2', 'b4', 'b6', 'c3', 'c4', 'c5',
  'd1', 'd2', 'd3', 'd5', 'd6', 'd7',
  'e3', 'e4', 'e5', 'f2', 'f4', 'f6', 'g1', 'g4', 'g7',
]

const EDGES = [
  ['a1', 'a4'], ['a4', 'a7'], ['b2', 'b4'], ['b4', 'b6'],
  ['c3', 'c4'], ['c4', 'c5'], ['d1', 'd2'], ['d2', 'd3'],
  ['d5', 'd6'], ['d6', 'd7'], ['e3', 'e4'], ['e4', 'e5'],
  ['f2', 'f4'], ['f4', 'f6'], ['g1', 'g4'], ['g4', 'g7'],
  ['a1', 'd1'], ['d1', 'g1'], ['b2', 'd2'], ['d2', 'f2'],
  ['c3', 'd3'], ['d3', 'e3'], ['a4', 'b4'], ['b4', 'c4'],
  ['e4', 'f4'], ['f4', 'g4'], ['c5', 'd5'], ['d5', 'e5'],
  ['b6', 'd6'], ['d6', 'f6'], ['a7', 'd7'], ['d7', 'g7'],
]

const MILLS = [
  ['a1', 'a4', 'a7'], ['b2', 'b4', 'b6'], ['c3', 'c4', 'c5'],
  ['d1', 'd2', 'd3'], ['d5', 'd6', 'd7'], ['e3', 'e4', 'e5'],
  ['f2', 'f4', 'f6'], ['g1', 'g4', 'g7'],
  ['a1', 'd1', 'g1'], ['b2', 'd2', 'f2'], ['c3', 'd3', 'e3'],
  ['a4', 'b4', 'c4'], ['e4', 'f4', 'g4'], ['a7', 'd7', 'g7'],
  ['b6', 'd6', 'f6'], ['c5', 'd5', 'e5'],
]

describe('proof: Morris complete games', () => {
  function createMorrisGame(variantConfig = {}) {
    return createGameFromDefinition(
      {
        topology: { type: 'graph', nodes: NODES, edges: EDGES },
        players: { names: ['player1', 'player2'], count: 2 },
        plugins: { morris: { piecesPerPlayer: 9, mills: MILLS, ...variantConfig } },
      },
      {
        topologies: { graph: (config) => createGraphTopology(config) },
        pluginFactories: { morris: (cfg, ctx) => createMorrisPlugin(cfg, ctx) },
      }
    )
  }

  describe('Nine Men\'s Morris: placement → movement → win', () => {
    it('full placement phase (18 moves) transitions to movement', () => {
      const game = createMorrisGame()
      const placementNodes = [
        'a1', 'd1', 'a4', 'd2', 'a7', 'd3', // p1 mills a-column, p2 d1-d2-d3
        'b2', 'e3', 'b4', 'e4', 'b6', 'e5', // p1 mills b-column, p2 e3-e4-e5
        'c3', 'f2', 'c4', 'f4', 'c5', 'f6', // p1 mills c-column, p2 f2-f4-f6
      ]

      let millsFormed = 0
      for (let i = 0; i < placementNodes.length; i++) {
        const result = game.execute({ action: 'place', coord: placementNodes[i] })
        if (result.continueTurn) {
          millsFormed++
          // Remove an opponent piece
          const state = game.getState('morris')
          const opponent = game.currentPlayer() === 'player1' ? 'player2' : 'player1'
          const removable = Object.entries(state.nodes)
            .find(([, v]) => v === opponent)
          if (removable) {
            game.execute({ action: 'remove', coord: removable[0] })
          }
        }
      }

      expect(millsFormed).toBeGreaterThan(0)
      expect(game.getState('morris').phase).toBe('move')
    })

    it('wins by reducing opponent below 3 pieces', () => {
      const game = createMorrisGame()
      // Set up move phase with player1 having many pieces, player2 having 3
      const nodes = {}
      for (const n of NODES) nodes[n] = null
      nodes.a1 = 'player1'; nodes.a4 = 'player1'; nodes.a7 = 'player1'
      nodes.b2 = 'player1'; nodes.b4 = 'player1'
      nodes.d1 = 'player2'; nodes.d2 = 'player2'; nodes.d3 = 'player2'

      game.store.set('morris', {
        nodes, phase: 'move', piecesInHand: [0, 0], awaitingRemoval: false,
      }, 'morris')

      // player1 forms a mill by moving b4 to c4 (b2-b4-b6 not complete, but a1-a4-a7 is already there)
      // Actually a1-a4-a7 already exists — that's already a mill!
      // Let's break it and reform to trigger removal
      // Move a7 away, then back to form mill
      const result1 = game.execute({ action: 'move', from: 'a7', to: 'd7' })
      expect(result1.ok).toBe(true)

      // player2 moves
      game.execute({ action: 'move', from: 'd1', to: 'g1' })

      // player1 moves back to form mill a1-a4-a7
      const result2 = game.execute({ action: 'move', from: 'd7', to: 'a7' })
      expect(result2.continueTurn).toBe(true)

      // Remove one of player2's pieces
      game.execute({ action: 'remove', coord: 'g1' })

      // player2 now has 2 pieces — game should end
      // checkWin checks after NEXT move... let's continue
      // player2 moves
      game.execute({ action: 'move', from: 'd2', to: 'd1' })

      // player1 makes any legal move — checkWin evaluates
      const result3 = game.execute({ action: 'move', from: 'b4', to: 'c4' })
      expect(result3.winner).toBe('player1')
    })
  })

  describe('Six Men\'s Morris variant: fewer pieces', () => {
    it('uses 6 pieces per player', () => {
      const game = createMorrisGame({ piecesPerPlayer: 6 })
      expect(game.getState('morris').piecesInHand).toEqual([6, 6])
    })

    it('transitions to move phase after 12 placements', () => {
      const game = createMorrisGame({ piecesPerPlayer: 6 })
      const spots = ['a1', 'd1', 'a4', 'd2', 'a7', 'd3', 'b2', 'e3', 'b4', 'e4', 'b6', 'e5']
      for (let i = 0; i < spots.length; i++) {
        const result = game.execute({ action: 'place', coord: spots[i] })
        if (result.continueTurn) {
          const state = game.getState('morris')
          const opponent = game.currentPlayer() === 'player1' ? 'player2' : 'player1'
          const removable = Object.entries(state.nodes).find(([, v]) => v === opponent)
          if (removable) game.execute({ action: 'remove', coord: removable[0] })
        }
      }
      expect(game.getState('morris').phase).toBe('move')
    })
  })
})
