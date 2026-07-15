import { createRacePlugin } from '../index.js'

function makeContext(currentIndex = 0) {
  return { __players: { currentIndex } }
}

function request(key) {
  return null
}

describe('plugin-race', () => {
  const defaultPlugin = createRacePlugin({
    positions: 20,
    piecesPerPlayer: 2,
    playerCount: 2,
    safeSquares: [5, 10],
    diceType: 'standard',
    enterValues: [6],
  })

  describe('init', () => {
    it('creates pieces for all players', () => {
      const state = defaultPlugin.init({}, { request })
      expect(state.pieces.length).toBe(2)
      expect(state.pieces[0].length).toBe(2)
      expect(state.pieces[1].length).toBe(2)
    })

    it('all pieces start at home', () => {
      const state = defaultPlugin.init({}, { request })
      for (const playerPieces of state.pieces) {
        for (const piece of playerPieces) {
          expect(piece.state).toBe('home')
          expect(piece.position).toBe(-1)
        }
      }
    })

    it('starts with no roll', () => {
      const state = defaultPlugin.init({}, { request })
      expect(state.currentRoll).toBe(null)
    })

    it('supports 4-player setup (pachisi)', () => {
      const plugin = createRacePlugin({ positions: 68, piecesPerPlayer: 4, playerCount: 4 })
      const state = plugin.init({}, { request })
      expect(state.pieces.length).toBe(4)
      expect(state.pieces[0].length).toBe(4)
    })
  })

  describe('rolling', () => {
    it('must roll before moving', () => {
      const state = defaultPlugin.init({}, { request })
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(1)
      expect(moves[0].action).toBe('roll')
    })

    it('roll sets currentRoll and returns continueTurn', () => {
      const state = defaultPlugin.init({}, { request })
      const result = defaultPlugin.applyMove({ action: 'roll', result: { value: 6, grace: false } }, state, makeContext(0))
      expect(result.state.currentRoll).toBe(6)
      expect(result.continueTurn).toBe(true)
    })
  })

  describe('entering pieces', () => {
    it('can enter a piece on a 6', () => {
      const state = { ...defaultPlugin.init({}, { request }), currentRoll: 6 }
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      const enters = moves.filter(m => m.action === 'enter')
      expect(enters.length).toBe(2)
    })

    it('cannot enter on non-entry roll', () => {
      const state = { ...defaultPlugin.init({}, { request }), currentRoll: 3 }
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      const enters = moves.filter(m => m.action === 'enter')
      expect(enters.length).toBe(0)
    })

    it('entering places piece at position 0', () => {
      const state = { ...defaultPlugin.init({}, { request }), currentRoll: 6, graceAvailable: false }
      const result = defaultPlugin.applyMove({ action: 'enter', pieceIndex: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.pieces[0][0].state).toBe('active')
      expect(newState.pieces[0][0].position).toBe(0)
    })
  })

  describe('moving pieces', () => {
    it('advances piece by roll value', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 5, laps: 0 }
      state.currentRoll = 4
      const result = defaultPlugin.applyMove({ action: 'move', pieceIndex: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.pieces[0][0].position).toBe(9)
    })

    it('piece finishes when reaching track end', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 18, laps: 0 }
      state.currentRoll = 2
      const result = defaultPlugin.applyMove({ action: 'move', pieceIndex: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.pieces[0][0].state).toBe('finished')
    })

    it('exact finish blocks overshooting', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 18, laps: 0 }
      state.currentRoll = 5
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      const pieceMoves = moves.filter(m => m.action === 'move' && m.pieceIndex === 0)
      expect(pieceMoves.length).toBe(0)
    })
  })

  describe('capture (send home)', () => {
    it('captures opponent piece on landing', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 3, laps: 0 }
      state.pieces[1][0] = { state: 'active', position: 7, laps: 0 }
      state.currentRoll = 4
      const result = defaultPlugin.applyMove({ action: 'move', pieceIndex: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.pieces[1][0].state).toBe('home')
      expect(newState.pieces[1][0].position).toBe(-1)
    })

    it('cannot capture on safe square', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 3, laps: 0 }
      state.pieces[1][0] = { state: 'active', position: 5, laps: 0 }
      state.currentRoll = 2
      const result = defaultPlugin.applyMove({ action: 'move', pieceIndex: 0 }, state, makeContext(0))
      const newState = result.state || result
      expect(newState.pieces[1][0].state).toBe('active')
      expect(newState.pieces[1][0].position).toBe(5)
    })
  })

  describe('blockade', () => {
    it('cannot move to blockaded position', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'active', position: 3, laps: 0 }
      state.pieces[1][0] = { state: 'active', position: 7, laps: 0 }
      state.pieces[1][1] = { state: 'active', position: 7, laps: 0 }
      state.currentRoll = 4
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      const movesTo7 = moves.filter(m => m.action === 'move' && m.pieceIndex === 0)
      expect(movesTo7.length).toBe(0)
    })
  })

  describe('pass', () => {
    it('passes when no legal moves available', () => {
      const state = defaultPlugin.init({}, { request })
      state.currentRoll = 3
      const moves = defaultPlugin.getLegalMoves(state, makeContext(0))
      expect(moves.length).toBe(1)
      expect(moves[0].action).toBe('pass')
    })

    it('pass clears the roll', () => {
      const state = { ...defaultPlugin.init({}, { request }), currentRoll: 3 }
      const result = defaultPlugin.applyMove({ action: 'pass' }, state, makeContext(0))
      expect(result.currentRoll).toBe(null)
    })
  })

  describe('grace rolls (pachisi extra turn)', () => {
    it('grace roll grants extra turn', () => {
      const plugin = createRacePlugin({
        positions: 20,
        piecesPerPlayer: 2,
        playerCount: 2,
        graceRolls: true,
        enterValues: [6, 7, 10, 25],
        diceType: 'shells',
      })
      const state = { ...plugin.init({}, { request }), currentRoll: 7, graceAvailable: true }
      state.pieces[0][0] = { state: 'active', position: 3, laps: 0 }
      const result = plugin.applyMove({ action: 'move', pieceIndex: 0 }, state, makeContext(0))
      expect(result.state).toBeDefined()
      expect(result.continueTurn).toBe(true)
    })
  })

  describe('win condition', () => {
    it('wins when all pieces finished', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'finished', position: 20, laps: 0 }
      state.pieces[0][1] = { state: 'finished', position: 20, laps: 0 }
      expect(defaultPlugin.checkWin(state, makeContext(0))).toBe('player1')
    })

    it('returns null when game ongoing', () => {
      const state = defaultPlugin.init({}, { request })
      state.pieces[0][0] = { state: 'finished', position: 20, laps: 0 }
      expect(defaultPlugin.checkWin(state, makeContext(0))).toBe(null)
    })
  })

  describe('metadata', () => {
    it('has correct slice name', () => {
      expect(defaultPlugin.sliceName).toBe('race')
    })

    it('declares rules for composition', () => {
      expect(defaultPlugin.rules).toContain('movement.track-dice')
      expect(defaultPlugin.rules).toContain('constraint.blockade')
      expect(defaultPlugin.rules).toContain('constraint.safe-square')
    })
  })
})
