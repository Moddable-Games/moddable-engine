import { scoreGame, emptyRegions, removeDeadStones, countStones } from '../src/scoring.js'

const SIZE = 5

function neighbours(pos) {
  const row = Math.floor(pos / SIZE)
  const col = pos % SIZE
  const out = []
  if (row > 0) out.push(pos - SIZE)
  if (row < SIZE - 1) out.push(pos + SIZE)
  if (col > 0) out.push(pos - 1)
  if (col < SIZE - 1) out.push(pos + 1)
  return out
}

function emptyBoard() {
  return new Array(SIZE * SIZE).fill(null)
}

// Black seals the top-left point, white seals the bottom-right point,
// and the middle is bordered by both so it counts to neither.
function sealedCorners() {
  const board = emptyBoard()
  board[1] = 'black'
  board[5] = 'black'
  board[19] = 'white'
  board[23] = 'white'
  return board
}

describe('go scoring', () => {
  describe('emptyRegions', () => {
    it('treats a wholly empty board as one neutral region', () => {
      const regions = emptyRegions(emptyBoard(), neighbours)
      expect(regions.length).toBe(1)
      expect(regions[0].cells.length).toBe(25)
      expect(regions[0].owner).toBeNull()
    })

    it('assigns a region enclosed by one colour to that colour', () => {
      const board = sealedCorners()
      const regions = emptyRegions(board, neighbours)
      const black = regions.filter(r => r.owner === 'black')
      const white = regions.filter(r => r.owner === 'white')
      expect(black.length).toBe(1)
      expect(black[0].cells).toEqual([0])
      expect(white.length).toBe(1)
      expect(white[0].cells).toEqual([24])
    })

    it('leaves the shared centre neutral when both colours border it', () => {
      const regions = emptyRegions(sealedCorners(), neighbours)
      const neutral = regions.filter(r => r.owner === null)
      expect(neutral.length).toBe(1)
      expect(neutral[0].borders.sort()).toEqual(['black', 'white'])
    })

    it('leaves a region bordered by both colours neutral', () => {
      const board = emptyBoard()
      board[0] = 'black'
      board[2] = 'white'
      const regions = emptyRegions(board, neighbours)
      expect(regions.every(r => r.owner === null)).toBe(true)
    })
  })

  describe('removeDeadStones', () => {
    it('clears marked stones and counts them as prisoners', () => {
      const board = emptyBoard()
      board[6] = 'white'
      board[7] = 'white'
      const { board: cleaned, prisoners } = removeDeadStones(board, [6, 7])
      expect(cleaned[6]).toBeNull()
      expect(prisoners.white).toBe(2)
    })

    it('ignores marks on empty points', () => {
      const { prisoners } = removeDeadStones(emptyBoard(), [4])
      expect(prisoners.black).toBe(0)
      expect(prisoners.white).toBe(0)
    })
  })

  describe('countStones', () => {
    it('counts stones by colour', () => {
      const board = emptyBoard()
      board[0] = 'black'
      board[1] = 'black'
      board[2] = 'white'
      expect(countStones(board)).toEqual({ black: 2, white: 1 })
    })
  })

  describe('scoreGame', () => {
    it('awards komi to white on an empty board', () => {
      const result = scoreGame(
        { board: emptyBoard(), captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 6.5 }
      )
      expect(result.scores.white).toBe(6.5)
      expect(result.scores.black).toBe(0)
      expect(result.winner).toBe(1)
    })

    it('counts territory for the enclosing colour', () => {
      const result = scoreGame(
        { board: sealedCorners(), captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 0 }
      )
      expect(result.territory.black).toBe(1)
      expect(result.territory.white).toBe(1)
      expect(result.winner).toBe('draw')
    })

    it('leaves dame out of both scores', () => {
      const result = scoreGame(
        { board: sealedCorners(), captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 0 }
      )
      // 25 points, 4 stones, 2 counted as territory, remainder is neutral
      expect(result.neutral.length).toBe(19)
    })

    it('area scoring counts stones as well as territory', () => {
      const result = scoreGame(
        { board: sealedCorners(), captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'area', komi: 0 }
      )
      // 2 stones + 1 enclosed point per side
      expect(result.scores.black).toBe(3)
      expect(result.scores.white).toBe(3)
    })

    it('territory scoring credits captured prisoners', () => {
      const result = scoreGame(
        { board: emptyBoard(), captures: { 0: 3, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 0 }
      )
      expect(result.scores.black).toBe(3)
    })

    it('dead stones convert to prisoners for the opponent', () => {
      const board = sealedCorners()
      // a lone black stone stranded inside white's sealed corner, agreed dead
      board[24] = 'black'
      const result = scoreGame(
        { board, captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 0, deadStones: [24] }
      )
      // white reclaims the point and banks the stone as a prisoner
      expect(result.territory.white).toBe(1)
      expect(result.scores.white).toBe(2)
      expect(result.scores.black).toBe(1)
      expect(result.winner).toBe(1)
    })

    it('reports a draw when scores are level', () => {
      const result = scoreGame(
        { board: emptyBoard(), captures: { 0: 0, 1: 0 } },
        { getNeighbours: neighbours, method: 'territory', komi: 0 }
      )
      expect(result.winner).toBe('draw')
      expect(result.margin).toBe(0)
    })

    it('requires a neighbour function', () => {
      expect(() => scoreGame({ board: emptyBoard() }, {})).toThrow(/getNeighbours/)
    })
  })
})
