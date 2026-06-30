export function createCastlingRule(config = {}) {
  const enabled = config.enabled !== false

  return {
    id: 'castling',
    category: 'movement',
    requires: ['attack-detection'],
    topologyNeeds: [],

    stateShape: { castlingRights: null },

    hooks: {
      init(ruleConfig, ctx) {
        if (!enabled) return null
        const playerCount = ctx.playerCount || 2
        const rights = {}
        for (let i = 0; i < playerCount; i++) {
          rights[i] = { king: true, queen: true }
        }
        return { castlingRights: rights }
      },

      applyMove(move, state, ctx) {
        if (!enabled || !state.castlingRights) return null

        if (move.castle) {
          const board = [...state.board]
          board[move.to] = board[move.from]
          board[move.from] = null
          board[move.rookTo] = board[move.rookFrom]
          board[move.rookFrom] = null
          const castlingRights = deepCopy(state.castlingRights)
          castlingRights[ctx.playerIndex] = { king: false, queen: false }
          return { board, castlingRights, handled: true }
        }

        const piece = state.board[move.from]
        if (!piece) return null

        const castlingRights = deepCopy(state.castlingRights)
        let changed = false

        const royalType = config.royalType || 'king'
        const rookType = config.rookType || 'rook'

        if (piece.type === royalType) {
          castlingRights[piece.owner] = { king: false, queen: false }
          changed = true
        }

        if (piece.type === rookType) {
          const rookPositions = findRookPositions(state, piece.owner, ctx)
          if (move.from === rookPositions.king) {
            castlingRights[piece.owner].king = false
            changed = true
          } else if (move.from === rookPositions.queen) {
            castlingRights[piece.owner].queen = false
            changed = true
          }
        }

        const captured = state.board[move.to]
        if (captured && captured.type === rookType) {
          const rookPositions = findRookPositions(state, captured.owner, ctx)
          if (move.to === rookPositions.king) {
            castlingRights[captured.owner].king = false
            changed = true
          } else if (move.to === rookPositions.queen) {
            castlingRights[captured.owner].queen = false
            changed = true
          }
        }

        return changed ? { castlingRights } : null
      },

      getLegalMoves(state, ctx) {
        if (!enabled || !state.castlingRights) return null
        const { topology, playerIndex } = ctx
        const rights = state.castlingRights[playerIndex]
        if (!rights || (!rights.king && !rights.queen)) return null

        const royalType = config.royalType || 'king'
        const rookType = config.rookType || 'rook'

        const kingPos = state.board.findIndex(
          c => c && c.type === royalType && c.owner === playerIndex
        )
        if (kingPos === -1) return null

        const attackDetection = ctx.rules.get('attack-detection')
        if (!attackDetection) return null

        if (attackDetection.isAttacked(kingPos, state, ctx)) return null

        const rookPositions = findRookPositions(state, playerIndex, ctx)
        const cols = topology ? topology.cols : 8

        const kingRow = Math.floor(kingPos / cols)
        const moves = []

        if (rights.king && rookPositions.king !== -1) {
          const kingDest = config.kingDestKing !== undefined
            ? kingRow * cols + config.kingDestKing
            : kingRow * cols + 6
          const rookDest = config.rookDestKing !== undefined
            ? kingRow * cols + config.rookDestKing
            : kingRow * cols + 5

          if (canCastle(state, kingPos, kingDest, rookPositions.king, rookDest, attackDetection, ctx, cols)) {
            moves.push({ from: kingPos, to: kingDest, castle: true, rookFrom: rookPositions.king, rookTo: rookDest, handled: true })
          }
        }

        if (rights.queen && rookPositions.queen !== -1) {
          const kingDest = config.kingDestQueen !== undefined
            ? kingRow * cols + config.kingDestQueen
            : kingRow * cols + 2
          const rookDest = config.rookDestQueen !== undefined
            ? kingRow * cols + config.rookDestQueen
            : kingRow * cols + 3

          if (canCastle(state, kingPos, kingDest, rookPositions.queen, rookDest, attackDetection, ctx, cols)) {
            moves.push({ from: kingPos, to: kingDest, castle: true, rookFrom: rookPositions.queen, rookTo: rookDest, handled: true })
          }
        }

        return moves.length > 0 ? moves : null
      },
    },
  }
}

function findRookPositions(state, owner, ctx) {
  const { topology } = ctx
  const cols = topology ? topology.cols : 8
  const rows = topology ? topology.rows : 8
  const rookType = ctx.config?.rookType || 'rook'
  const royalType = ctx.config?.royalType || 'king'

  const kingPos = state.board.findIndex(c => c && c.type === royalType && c.owner === owner)
  if (kingPos === -1) return { king: -1, queen: -1 }

  const kingRow = Math.floor(kingPos / cols)
  const kingCol = kingPos % cols

  if (state.rookStartPositions && state.rookStartPositions[owner]) {
    return state.rookStartPositions[owner]
  }

  let kingSideRook = -1
  let queenSideRook = -1

  for (let c = cols - 1; c > kingCol; c--) {
    const idx = kingRow * cols + c
    if (state.board[idx] && state.board[idx].type === rookType && state.board[idx].owner === owner) {
      kingSideRook = idx
      break
    }
  }

  for (let c = 0; c < kingCol; c++) {
    const idx = kingRow * cols + c
    if (state.board[idx] && state.board[idx].type === rookType && state.board[idx].owner === owner) {
      queenSideRook = idx
      break
    }
  }

  return { king: kingSideRook, queen: queenSideRook }
}

function canCastle(state, kingFrom, kingDest, rookFrom, rookDest, attackDetection, ctx, cols) {
  const board = state.board
  if (rookFrom === -1) return false
  if (!board[rookFrom]) return false

  const minSq = Math.min(kingFrom, kingDest, rookFrom, rookDest)
  const maxSq = Math.max(kingFrom, kingDest, rookFrom, rookDest)
  for (let sq = minSq; sq <= maxSq; sq++) {
    if (sq === kingFrom || sq === rookFrom) continue
    if (board[sq] !== null) return false
  }

  const step = kingDest > kingFrom ? 1 : -1
  for (let sq = kingFrom; sq !== kingDest + step; sq += step) {
    if (attackDetection.isAttacked(sq, state, ctx)) return false
  }

  return true
}

function deepCopy(rights) {
  const copy = {}
  for (const key of Object.keys(rights)) {
    copy[key] = { ...rights[key] }
  }
  return copy
}
