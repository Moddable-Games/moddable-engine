export function createEnPassantRule(config = {}) {
  const enabled = config.enabled !== false

  return {
    id: 'en-passant',
    category: 'movement',
    requires: [],
    topologyNeeds: [],

    stateShape: { enPassantTarget: null },

    hooks: {
      init() {
        if (!enabled) return null
        return { enPassantTarget: null }
      },

      applyMove(move, state, ctx) {
        if (!enabled) return null
        const { topology } = ctx

        if (move.enPassant) {
          const board = cloneBoard(state.board)
          setCell(board, move.to, getCell(board, move.from))
          setCell(board, move.from, null)
          setCell(board, move.captured, null)
          return { board, enPassantTarget: null, handled: true }
        }

        const piece = getCell(state.board, move.from)
        if (!piece) return { enPassantTarget: null }

        const pawnType = config.pawnType || 'pawn'
        if (piece.type !== pawnType) return { enPassantTarget: null }

        if (topology && topology.step && config.pawnConfig) {
          const fwd = config.pawnConfig.forwardDir[piece.owner]
          const oneStep = topology.step(move.from, fwd)
          const twoStep = oneStep !== null ? topology.step(oneStep, fwd) : null
          if (twoStep === move.to) {
            return { enPassantTarget: oneStep }
          }
        } else if (topology && topology.cols !== undefined) {
          const cols = topology.cols
          if (Math.abs(move.to - move.from) === cols * 2) {
            return { enPassantTarget: (move.from + move.to) / 2 }
          }
        }

        return { enPassantTarget: null }
      },

      getLegalMoves(state, ctx) {
        if (!enabled || state.enPassantTarget === null) return null
        const { topology, playerIndex } = ctx
        const pawnType = config.pawnType || 'pawn'
        const epTarget = state.enPassantTarget

        if (config.pawnConfig && topology && topology.step) {
          return getEPMovesViaConfig(state, topology, playerIndex, pawnType, epTarget, config.pawnConfig)
        }

        return getEPMovesViaGrid(state, topology, playerIndex, pawnType, epTarget, ctx)
      },
    },
  }
}

function getEPMovesViaConfig(state, topology, playerIndex, pawnType, epTarget, pawnConfig) {
  const moves = []
  const capDirs = pawnConfig.captureDirections[playerIndex]
  const oppFwd = pawnConfig.forwardDir[1 - playerIndex]

  for (const pos of topology.getAllCells()) {
    const piece = getCell(state.board, pos)
    if (!piece || piece.type !== pawnType || piece.owner !== playerIndex) continue
    for (const capDir of capDirs) {
      const target = topology.step(pos, capDir)
      if (target === epTarget) {
        const capturedPawn = topology.step(epTarget, oppFwd)
        moves.push({ from: pos, to: epTarget, capture: true, enPassant: true, captured: capturedPawn })
      }
    }
  }

  return moves.length > 0 ? moves : null
}

function getEPMovesViaGrid(state, topology, playerIndex, pawnType, epTarget, ctx) {
  const cols = topology ? topology.cols : 8
  const advancement = config.advancement || ctx.config?.advancement
  if (!advancement) return null
  const dir = typeof advancement === 'function'
    ? advancement(playerIndex)
    : advancement[playerIndex]
  if (!dir) return null

  const moves = []
  const captureFrom = [epTarget - dir * cols - 1, epTarget - dir * cols + 1]
  for (const from of captureFrom) {
    if (from < 0 || from >= state.board.length) continue
    const piece = getCell(state.board, from)
    if (!piece || piece.type !== pawnType || piece.owner !== playerIndex) continue
    const fromCol = from % cols
    const targetCol = epTarget % cols
    if (Math.abs(targetCol - fromCol) !== 1) continue
    const capturedPawn = epTarget - dir * cols
    moves.push({ from, to: epTarget, capture: true, enPassant: true, captured: capturedPawn })
  }

  return moves.length > 0 ? moves : null
}

function getCell(board, pos) {
  if (Array.isArray(board)) return board[pos]
  return board[pos] || null
}

function setCell(board, pos, value) {
  board[pos] = value
}

function cloneBoard(board) {
  if (Array.isArray(board)) return [...board]
  return { ...board }
}
