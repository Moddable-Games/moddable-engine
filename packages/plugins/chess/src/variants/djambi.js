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
 * Steps 1-2 were written against `hooks.afterCapture` and a `turnLogic` the
 * plugin declined to call above two players, so neither ran. They run now.
 * Steps 3-6 remain; playable: false until then.
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
    return moves.filter(m => {
      if (m.action) return true
      const target = state.board[m.to]

      // A corpse is not a capture. Ordinary generation treats any cell the
      // mover does not own as takeable, so every piece could eat the bodies -
      // seven of them reached the board in one playthrough and none survived
      // to the end. Only the necromobile touches a corpse, and it moves one
      // rather than taking it.
      if (target && target.owner < 0) return false

      // Maze occupancy: only the chief may end a turn on the centre. Others
      // pass through it while it is empty.
      if (m.to === MAZE_CELL) {
        const piece = state.board[m.from]
        return piece && piece.type === 'chief'
      }
      return true
    })
  },

  // A kill that leaves a body to place does not end the turn. `turnLogic` used
  // to be gated to two-player variants, so this was never called either.
  turnLogic(ctx) {
    if (ctx.slice._pendingCorpse !== undefined) return true
    return false
  },

  // Captures go through `afterMove`, which the chess plugin actually calls.
  // This was written as `hooks: { afterCapture }`, and the chess plugin has no
  // hooks system at all - only the go plugin does, and its set has no
  // afterCapture either. So the corpse rule, the whole point of the variant,
  // was declared and read by nothing: pieces were captured and removed exactly
  // as in ordinary chess. Playing it out, 25 of 36 pieces vanished in 24 plies
  // and not one corpse ever reached the board.
  afterMove(ctx) {
    const { move, captured, board, slice } = ctx
    if (!captured || captured.owner < 0) return
    const mover = board[move.to]
    if (!mover) return

    // The assassin's victim drops where the assassin set out from, so the
    // corpse placement is forced and needs no second phase.
    if (mover.type === 'assassin') {
      board[move.from] = { type: 'corpse', owner: -1 }
      return
    }

    // Everyone else chooses where the body goes, which is a second phase.
    slice._pendingCorpse = captured.type
    slice._pendingCorpseOwner = captured.owner
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
