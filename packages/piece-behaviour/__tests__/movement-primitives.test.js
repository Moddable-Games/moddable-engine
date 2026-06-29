import { slide, leap, jump, custodian, DIRECTIONS } from '../src/movement-primitives.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'

describe('movement-primitives', () => {
  const topology = createGridTopology({ rows: 8, cols: 8 })
  const emptyBoard = new Array(64).fill(null)

  function boardWith(placements) {
    const board = [...emptyBoard]
    for (const [idx, piece] of Object.entries(placements)) {
      board[Number(idx)] = piece
    }
    return board
  }

  describe('slide', () => {
    test('rook slides along rank and file', () => {
      const from = topology.toIndex(3, 3)
      const moves = slide(topology, from, DIRECTIONS.orthogonal, emptyBoard)
      expect(moves.length).toBe(14)
      expect(moves.every(m => m.from === from)).toBe(true)
    })

    test('bishop slides along diagonals', () => {
      const from = topology.toIndex(3, 3)
      const moves = slide(topology, from, DIRECTIONS.diagonal, emptyBoard)
      expect(moves.length).toBe(13)
    })

    test('slide blocked by friendly piece', () => {
      const from = topology.toIndex(3, 3)
      const board = boardWith({ [topology.toIndex(3, 5)]: { friendly: true } })
      const moves = slide(topology, from, [[0, 1]], board)
      expect(moves.map(m => m.to)).toEqual([topology.toIndex(3, 4)])
    })

    test('slide captures enemy piece and stops', () => {
      const from = topology.toIndex(3, 3)
      const board = boardWith({ [topology.toIndex(3, 5)]: { enemy: true } })
      const moves = slide(topology, from, [[0, 1]], board)
      expect(moves).toHaveLength(2)
      expect(moves[1].capture).toBe(true)
      expect(moves[1].to).toBe(topology.toIndex(3, 5))
    })

    test('maxSteps limits range (king = 1 step slide)', () => {
      const from = topology.toIndex(3, 3)
      const moves = slide(topology, from, DIRECTIONS.all, emptyBoard, { maxSteps: 1 })
      expect(moves).toHaveLength(8)
    })

    test('blockFn stops ray', () => {
      const from = topology.toIndex(3, 3)
      const blocked = topology.toIndex(3, 5)
      const moves = slide(topology, from, [[0, 1]], emptyBoard, { blockFn: sq => sq === blocked })
      expect(moves.map(m => m.to)).toEqual([topology.toIndex(3, 4)])
    })
  })

  describe('leap', () => {
    test('knight has 8 moves from center', () => {
      const from = topology.toIndex(3, 3)
      const moves = leap(topology, from, DIRECTIONS.knight, emptyBoard)
      expect(moves).toHaveLength(8)
    })

    test('knight has 2 moves from corner', () => {
      const from = topology.toIndex(0, 0)
      const moves = leap(topology, from, DIRECTIONS.knight, emptyBoard)
      expect(moves).toHaveLength(2)
    })

    test('leap captures enemy', () => {
      const from = topology.toIndex(3, 3)
      const target = topology.toIndex(1, 2)
      const board = boardWith({ [target]: { enemy: true } })
      const moves = leap(topology, from, DIRECTIONS.knight, board)
      const capMove = moves.find(m => m.to === target)
      expect(capMove.capture).toBe(true)
    })

    test('leap blocked by friendly', () => {
      const from = topology.toIndex(3, 3)
      const target = topology.toIndex(1, 2)
      const board = boardWith({ [target]: { friendly: true } })
      const moves = leap(topology, from, DIRECTIONS.knight, board)
      expect(moves.find(m => m.to === target)).toBeUndefined()
    })
  })

  describe('jump (draughts capture)', () => {
    test('jumps over enemy to empty landing', () => {
      const from = topology.toIndex(3, 3)
      const over = topology.toIndex(2, 2)
      const landing = topology.toIndex(1, 1)
      const board = boardWith({ [over]: { enemy: true } })
      const moves = jump(topology, from, [-1, -1], board)
      expect(moves).toHaveLength(1)
      expect(moves[0].to).toBe(landing)
      expect(moves[0].captured).toBe(over)
    })

    test('no jump over empty square', () => {
      const from = topology.toIndex(3, 3)
      const moves = jump(topology, from, [-1, -1], emptyBoard)
      expect(moves).toHaveLength(0)
    })

    test('no jump if landing is occupied', () => {
      const from = topology.toIndex(3, 3)
      const over = topology.toIndex(2, 2)
      const landing = topology.toIndex(1, 1)
      const board = boardWith({ [over]: { enemy: true }, [landing]: { friendly: true } })
      const moves = jump(topology, from, [-1, -1], board)
      expect(moves).toHaveLength(0)
    })

    test('no jump over friendly', () => {
      const from = topology.toIndex(3, 3)
      const over = topology.toIndex(2, 2)
      const board = boardWith({ [over]: { friendly: true } })
      const moves = jump(topology, from, [-1, -1], board)
      expect(moves).toHaveLength(0)
    })
  })

  describe('custodian capture', () => {
    test('captures enemy sandwiched between two friendly', () => {
      const from = topology.toIndex(3, 3)
      const enemy = topology.toIndex(3, 4)
      const ally = topology.toIndex(3, 5)
      const board = boardWith({ [enemy]: { enemy: true }, [ally]: { friendly: true } })
      const caps = custodian(topology, from, board)
      expect(caps).toContain(enemy)
    })

    test('no capture without ally on far side', () => {
      const from = topology.toIndex(3, 3)
      const enemy = topology.toIndex(3, 4)
      const board = boardWith({ [enemy]: { enemy: true } })
      const caps = custodian(topology, from, board)
      expect(caps).toHaveLength(0)
    })
  })

  describe('piece-registry integration', () => {
    test('registered piece generates moves via primitives', async () => {
      const { createPieceRegistry } = await import('../src/piece-registry.js')
      const registry = createPieceRegistry()
      registry.register('rook', {
        genMoves: (topo, from, board) => slide(topo, from, DIRECTIONS.orthogonal, board),
      })
      const moves = registry.genMoves('rook', topology, topology.toIndex(3, 3), emptyBoard)
      expect(moves).toHaveLength(14)
    })
  })
})
