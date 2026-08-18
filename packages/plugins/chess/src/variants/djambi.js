/**
 * Djambi (Machiavelli) — 4-player political strategy.
 *
 * Implementation follows docs/djambi-action-model.md. Build order:
 * 1. Corpses as accumulating blockers (this file)
 * 2. Chief and militant kill + placement
 * 3. Assassin (forced placement), reporter (multi-kill at range)
 * 4. Necromobile and diplomat (move corpse / move enemy)
 * 5. The maze: occupancy, extra turn, militant immunity
 * 6. Control transfer (requires core change)
 *
 * Currently implements steps 1-2. playable: false until step 5.
 */

const MAZE_CELL = 40 // 9*4 + 4 = center of 9x9

function chiefCaptureWin(state) {
  const board = state.board
  const livingChiefs = new Set()
  for (let i = 0; i < board.length; i++) {
    const piece = board[i]
    if (piece && piece.type === 'chief' && piece.owner >= 0) {
      livingChiefs.add(piece.owner)
    }
  }
  if (livingChiefs.size === 1) return [...livingChiefs][0]
  if (livingChiefs.size === 0) return -1 // draw
  return null
}

export const djambi = {
  key: 'djambi',
  slug: 'djambi',
  hidden: true,

  moveFilter(moves, state, ctx) {
    // Step 2: Force corpse placement if pending
    if (state._pendingCorpse !== undefined) {
      return moves.filter(m => m.action === 'placeCorpse')
    }
    // Step 5: Maze occupancy — only chief may end turn on center
    // (other pieces can pass through when empty)
    return moves.filter(m => {
      if (m.action) return true
      if (m.to === MAZE_CELL) {
        const piece = state.board[m.from]
        return piece && piece.type === 'chief'
      }
      return true
    })
  },

  turnLogic(ctx) {
    // Step 2: Force placement phase after a kill
    if (ctx.slice._pendingCorpse !== undefined) return true
    // Step 5: Extra turn while chief in maze (TODO)
    return false
  },

  // Step 2: Hook captures to create pending corpse placement
  hooks: {
    afterCapture(move, captured, { slice, board }) {
      const mover = board[move.to]
      if (!mover) return
      // Chief and militant: captured piece becomes pending corpse
      if (mover.type === 'chief' || mover.type === 'militant') {
        slice._pendingCorpse = captured.type
        slice._pendingCorpseOwner = captured.owner
      }
      // Step 3: Assassin places corpse at origin (immediate, no choice)
      if (mover.type === 'assassin') {
        board[move.from] = { type: 'corpse', owner: -1 }
      }
    },
  },

  actions: {
    // Step 2: Place corpse on any empty square
    placeCorpse: {
      skipsCheckFilter: true,
      continuesTurn: false,
      generate(slice, playerIdx, { allPositions, getCell }) {
        if (slice._pendingCorpse === undefined) return []
        const moves = []
        for (const pos of allPositions()) {
          if (getCell(slice.board, pos) === null) {
            moves.push({ action: 'placeCorpse', to: pos })
          }
        }
        return moves
      },
      apply(move, { board, slice }) {
        // Step 1: Corpses ACCUMULATE — no clearing previous position
        board[move.to] = { type: 'corpse', owner: -1 }
        return { board, sliceKeys: { _pendingCorpse: undefined, _pendingCorpseOwner: undefined } }
      },
    },
  },

  winCondition: chiefCaptureWin,
}
