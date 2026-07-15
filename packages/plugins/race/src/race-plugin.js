export function createRacePlugin(variantConfig = {}, context = {}) {
  const defaults = {
    positions: 68,
    piecesPerPlayer: 4,
    playerCount: 4,
    safeSquares: [],
    captureRule: 'send-home',
    blockadeSize: 2,
    laps: 1,
    exactFinish: true,
    graceRolls: false,
    diceType: 'shells',
    shellCount: 6,
    shellTable: null,
  }

  const config = { ...defaults, ...variantConfig }

  let topology = null
  let rng = null
  let dice = null

  function rollShells(shellRng) {
    if (config.shellTable) {
      const mouthsUp = shellRng.nextInt(0, config.shellCount)
      const entry = config.shellTable[mouthsUp]
      return entry || { value: mouthsUp, grace: false }
    }
    const mouthsUp = shellRng.nextInt(0, config.shellCount)
    return defaultShellResult(mouthsUp)
  }

  function defaultShellResult(mouthsUp) {
    if (mouthsUp === 0) return { value: config.shellCount + 1, grace: true }
    if (mouthsUp === 1) return { value: 10, grace: true }
    if (mouthsUp === config.shellCount) return { value: 25, grace: true }
    return { value: mouthsUp, grace: false }
  }

  function rollDice(diceRng) {
    if (config.diceType === 'shells') return rollShells(diceRng)
    if (dice) {
      const results = dice.roll(diceRng)
      return { value: results.reduce((a, b) => a + b, 0), grace: results[0] === results[1] }
    }
    const d1 = diceRng.nextInt(1, 6)
    const d2 = diceRng.nextInt(1, 6)
    return { value: d1 + d2, grace: d1 === d2 }
  }

  function isSafe(position) {
    return config.safeSquares.includes(position)
  }

  function isBlockaded(pieces, position, playerIndex) {
    let count = 0
    for (const [pIdx, pPieces] of pieces.entries()) {
      if (pIdx === playerIndex) continue
      for (const p of pPieces) {
        if (p.position === position && p.state === 'active') count++
      }
    }
    return count >= config.blockadeSize
  }

  function getTrackLength(playerIndex) {
    if (topology && topology.getPathLength) return topology.getPathLength(playerIndex)
    return config.positions * config.laps
  }

  return {
    sliceName: 'race',
    pieceTypes: ['pawn'],
    vocabulary: {
      pawn: { symbols: { count: true } },
    },
    config,
    rules: ['movement.track-dice', 'constraint.blockade', 'constraint.safe-square'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      rng = request('core.rng')
      dice = request('component.dice')

      const pieces = []
      for (let p = 0; p < config.playerCount; p++) {
        const playerPieces = []
        for (let i = 0; i < config.piecesPerPlayer; i++) {
          playerPieces.push({ state: 'home', position: -1, laps: 0 })
        }
        pieces.push(playerPieces)
      }

      return {
        pieces,
        currentRoll: null,
        graceAvailable: false,
      }
    },

    validateMove(move, slice, full) {
      const legal = this.getLegalMoves(slice, full)
      if (move.action === 'roll') return legal.some(m => m.action === 'roll')
      if (move.action === 'enter') return legal.some(m => m.action === 'enter' && m.pieceIndex === move.pieceIndex)
      if (move.action === 'move') return legal.some(m => m.action === 'move' && m.pieceIndex === move.pieceIndex)
      if (move.action === 'pass') return legal.some(m => m.action === 'pass')
      return false
    },

    applyMove(move, slice, full) {
      const playerIndex = full.__players.currentIndex

      if (move.action === 'roll') {
        const rollResult = move.result || (rng ? rollDice(rng) : { value: 4, grace: false })
        return {
          state: {
            ...slice,
            currentRoll: rollResult.value,
            graceAvailable: config.graceRolls && rollResult.grace,
          },
          continueTurn: true,
        }
      }

      const pieces = slice.pieces.map(pp => pp.map(p => ({ ...p })))

      if (move.action === 'enter') {
        pieces[playerIndex][move.pieceIndex].state = 'active'
        pieces[playerIndex][move.pieceIndex].position = 0
        const newSlice = { ...slice, pieces, currentRoll: null, graceAvailable: false }
        if (slice.graceAvailable) {
          return { state: { ...newSlice, currentRoll: null }, continueTurn: true }
        }
        return newSlice
      }

      if (move.action === 'move') {
        const piece = pieces[playerIndex][move.pieceIndex]
        const newPos = piece.position + slice.currentRoll
        const trackLen = getTrackLength(playerIndex)

        if (newPos >= trackLen) {
          if (config.exactFinish && newPos > trackLen) {
            return slice
          }
          piece.state = 'finished'
          piece.position = trackLen
        } else {
          piece.position = newPos

          if (config.captureRule === 'send-home' && !isSafe(newPos)) {
            for (let opp = 0; opp < pieces.length; opp++) {
              if (opp === playerIndex) continue
              for (const oppPiece of pieces[opp]) {
                if (oppPiece.state === 'active' && oppPiece.position === newPos) {
                  oppPiece.state = 'home'
                  oppPiece.position = -1
                }
              }
            }
          }
        }

        const newSlice = { ...slice, pieces, currentRoll: null, graceAvailable: false }
        if (slice.graceAvailable) {
          return { state: { ...newSlice, currentRoll: null }, continueTurn: true }
        }
        return newSlice
      }

      if (move.action === 'pass') {
        return { ...slice, currentRoll: null, graceAvailable: false }
      }

      return slice
    },

    getLegalMoves(slice, full) {
      const playerIndex = full.__players.currentIndex

      if (slice.currentRoll === null) {
        return [{ action: 'roll' }]
      }

      const moves = []
      const myPieces = slice.pieces[playerIndex]
      const rollValue = slice.currentRoll

      for (let i = 0; i < myPieces.length; i++) {
        const piece = myPieces[i]

        if (piece.state === 'home') {
          const enterValues = config.enterValues || [6, config.shellCount + 1, 10, 25]
          if (enterValues.includes(rollValue)) {
            if (!isBlockaded(slice.pieces, 0, playerIndex)) {
              moves.push({ action: 'enter', pieceIndex: i })
            }
          }
        }

        if (piece.state === 'active') {
          const newPos = piece.position + rollValue
          const trackLen = getTrackLength(playerIndex)
          if (config.exactFinish && newPos > trackLen) continue
          if (!isBlockaded(slice.pieces, newPos, playerIndex)) {
            moves.push({ action: 'move', pieceIndex: i })
          }
        }
      }

      if (moves.length === 0) {
        moves.push({ action: 'pass' })
      }

      return moves
    },

    checkWin(slice, full) {
      for (let p = 0; p < slice.pieces.length; p++) {
        const allFinished = slice.pieces[p].every(piece => piece.state === 'finished')
        if (allFinished) {
          return `player${p + 1}`
        }
      }
      return null
    },
  }
}
