import { slide, leap, jump, custodian } from '../src/movement-primitives.js'
import { createGridTopology } from '../../topologies/grid/src/topology-grid.js'

const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const ALL_DIRS = [...ORTHOGONAL, ...DIAGONAL]
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]

describe('movement-primitives (topology-agnostic)', () => {
  const topology = createGridTopology({ rows: 8, cols: 8 })
  const emptyBoard = new Array(64).fill(null)

  function boardWith(placements) {
    const board = [...emptyBoard]
    for (const [idx, piece] of Object.entries(placements)) {
      board[Number(idx)] = piece
    }
    return board
  }

  describe('slide — consumes rays from topology', () => {
    test('rook slides along rank and file', () => {
      const from = topology.toIndex(3, 3)
      const rays = topology.rays(from, ORTHOGONAL)
      const moves = slide(rays, from, emptyBoard)
      expect(moves.length).toBe(14)
    })

    test('bishop slides along diagonals', () => {
      const from = topology.toIndex(3, 3)
      const rays = topology.rays(from, DIAGONAL)
      const moves = slide(rays, from, emptyBoard)
      expect(moves.length).toBe(13)
    })

    test('slide blocked by friendly piece', () => {
      const from = topology.toIndex(3, 3)
      const board = boardWith({ [topology.toIndex(3, 5)]: { friendly: true } })
      const rays = topology.rays(from, [[0, 1]])
      const moves = slide(rays, from, board)
      expect(moves.map(m => m.to)).toEqual([topology.toIndex(3, 4)])
    })

    test('slide captures enemy and stops', () => {
      const from = topology.toIndex(3, 3)
      const board = boardWith({ [topology.toIndex(3, 5)]: { enemy: true } })
      const rays = topology.rays(from, [[0, 1]])
      const moves = slide(rays, from, board)
      expect(moves).toHaveLength(2)
      expect(moves[1].capture).toBe(true)
    })

    test('maxSteps limits range (king = 1 step)', () => {
      const from = topology.toIndex(3, 3)
      const rays = topology.rays(from, ALL_DIRS)
      const moves = slide(rays, from, emptyBoard, { maxSteps: 1 })
      expect(moves).toHaveLength(8)
    })

    test('blockFn stops ray', () => {
      const from = topology.toIndex(3, 3)
      const blocked = topology.toIndex(3, 5)
      const rays = topology.rays(from, [[0, 1]])
      const moves = slide(rays, from, emptyBoard, { blockFn: pos => pos === blocked })
      expect(moves.map(m => m.to)).toEqual([topology.toIndex(3, 4)])
    })
  })

  describe('leap — consumes position list from topology', () => {
    test('knight has 8 moves from center', () => {
      const from = topology.toIndex(3, 3)
      const targets = topology.leapTargets(from, KNIGHT)
      const moves = leap(targets, from, emptyBoard)
      expect(moves).toHaveLength(8)
    })

    test('knight has 2 moves from corner', () => {
      const from = topology.toIndex(0, 0)
      const targets = topology.leapTargets(from, KNIGHT)
      const moves = leap(targets, from, emptyBoard)
      expect(moves).toHaveLength(2)
    })

    test('leap captures enemy', () => {
      const from = topology.toIndex(3, 3)
      const target = topology.toIndex(1, 2)
      const board = boardWith({ [target]: { enemy: true } })
      const targets = topology.leapTargets(from, KNIGHT)
      const moves = leap(targets, from, board)
      const capMove = moves.find(m => m.to === target)
      expect(capMove.capture).toBe(true)
    })

    test('leap blocked by friendly', () => {
      const from = topology.toIndex(3, 3)
      const target = topology.toIndex(1, 2)
      const board = boardWith({ [target]: { friendly: true } })
      const targets = topology.leapTargets(from, KNIGHT)
      const moves = leap(targets, from, board)
      expect(moves.find(m => m.to === target)).toBeUndefined()
    })
  })

  describe('jump — consumes over/landing pairs from topology', () => {
    test('jumps over enemy to empty landing', () => {
      const from = topology.toIndex(3, 3)
      const pairs = topology.jumpPairs(from, [[-1, -1]])
      const over = topology.toIndex(2, 2)
      const landing = topology.toIndex(1, 1)
      const board = boardWith({ [over]: { enemy: true } })
      const moves = jump(pairs, from, board)
      expect(moves).toHaveLength(1)
      expect(moves[0].to).toBe(landing)
      expect(moves[0].captured).toBe(over)
    })

    test('no jump over empty', () => {
      const from = topology.toIndex(3, 3)
      const pairs = topology.jumpPairs(from, [[-1, -1]])
      const moves = jump(pairs, from, emptyBoard)
      expect(moves).toHaveLength(0)
    })

    test('no jump if landing occupied', () => {
      const from = topology.toIndex(3, 3)
      const pairs = topology.jumpPairs(from, [[-1, -1]])
      const over = topology.toIndex(2, 2)
      const landing = topology.toIndex(1, 1)
      const board = boardWith({ [over]: { enemy: true }, [landing]: { friendly: true } })
      const moves = jump(pairs, from, board)
      expect(moves).toHaveLength(0)
    })
  })

  describe('custodian — consumes adjacent/far pairs from topology', () => {
    test('captures sandwiched enemy', () => {
      const from = topology.toIndex(3, 3)
      const pairs = topology.adjacentPairs(from, ORTHOGONAL)
      const adjacent = topology.toIndex(3, 4)
      const far = topology.toIndex(3, 5)
      const board = boardWith({ [adjacent]: { enemy: true }, [far]: { friendly: true } })
      const caps = custodian(pairs, from, board)
      expect(caps).toContain(adjacent)
    })

    test('no capture without ally on far side', () => {
      const from = topology.toIndex(3, 3)
      const pairs = topology.adjacentPairs(from, ORTHOGONAL)
      const adjacent = topology.toIndex(3, 4)
      const board = boardWith({ [adjacent]: { enemy: true } })
      const caps = custodian(pairs, from, board)
      expect(caps).toHaveLength(0)
    })
  })

  describe('piece-registry uses topology traversals', () => {
    test('registered piece composes topology + primitives', async () => {
      const { createPieceRegistry } = await import('../src/piece-registry.js')
      const registry = createPieceRegistry()
      registry.register('rook', {
        genMoves: (topo, from, board) => slide(topo.rays(from, ORTHOGONAL), from, board),
      })
      const moves = registry.genMoves('rook', topology, topology.toIndex(3, 3), emptyBoard)
      expect(moves).toHaveLength(14)
    })
  })
})
