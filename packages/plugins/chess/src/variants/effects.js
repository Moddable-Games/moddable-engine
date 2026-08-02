export const poisonChess = {
  key: 'poisonChess',
  label: 'Poison Chess',
  group: 'Tactical',
  title: 'Poison Chess',
  description: 'Capture squares become poisoned for 3 turns. Non-king pieces landing on poison are destroyed.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  afterMove(ctx) {
    const { move, captured, board, effects, topology, playerIdx } = ctx
    const cols = topology ? topology.cols : 8
    const isCapture = !!captured

    if (isCapture) {
      ctx.addEffect({ sq: move.to, type: 'poison', duration: 3, owner: null })
    }

    if (!isCapture) {
      if (ctx.hasEffect(move.to, 'poison')) {
        const piece = board[move.to]
        if (piece && piece.type !== 'king') {
          board[move.to] = null
        }
      }
    } else {
      const poisonCount = effects.filter(e => e.sq === move.to && e.type === 'poison').length
      if (poisonCount >= 2) {
        const piece = board[move.to]
        if (piece && piece.type !== 'king') {
          board[move.to] = null
        }
      }
    }
  },
}

export const medusaChess = {
  key: 'medusaChess',
  label: 'Medusa Chess',
  group: 'Alternate Rules',
  title: 'Medusa Chess',
  description: 'After the queen moves, all enemy pieces she attacks become petrified for 2 turns. Kings immune.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  afterMove(ctx) {
    const { move, board, effects, topology, playerIdx } = ctx
    const piece = board[move.to]
    if (!piece || piece.type !== 'queen') return
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const owner = piece.owner
    const opponent = 1 - owner
    const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
    const r = Math.floor(move.to / cols), c = move.to % cols
    for (const [dr, dc] of DIRS) {
      let nr = r + dr, nc = c + dc
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const sq = nr * cols + nc
        const target = board[sq]
        if (target) {
          if (target.owner === opponent && target.type !== 'king') {
            if (!ctx.hasEffect(sq, 'petrify')) {
              ctx.addEffect({ sq, type: 'petrify', duration: 2, owner })
            }
          }
          break
        }
        nr += dr; nc += dc
      }
    }
  },

  moveFilter(moves, state, ctx) {
    const effects = state.effects || []
    return moves.filter(m => !effects.some(e => e.sq === m.from && e.type === 'petrify'))
  },
}

export const immunizationChess = {
  key: 'immunizationChess',
  label: 'Immunization Chess',
  group: 'Alternate Rules',
  title: 'Immunization Chess',
  description: 'Captured piece makes adjacent enemies immune for 2 rounds.',
  rule: 'Board: 8x8 · Win: Checkmate',
  rows: 8,
  cols: 8,

  afterMove(ctx) {
    const { move, captured, board, effects, topology, playerIdx } = ctx
    if (move.from !== move.to) {
      for (const eff of effects) {
        if (eff.type === 'immune' && eff.sq === move.from && eff.owner === playerIdx) {
          eff.sq = move.to
          break
        }
      }
    }
    if (!captured) return
    const cols = topology ? topology.cols : 8
    const rows = board.length / cols
    const capR = Math.floor(move.to / cols), capC = move.to % cols
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = capR + dr, nc = capC + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        const sq = nr * cols + nc
        const piece = board[sq]
        if (!piece) continue
        if (piece.owner !== playerIdx && piece.type !== 'king') {
          if (!ctx.hasEffect(sq, 'immune')) {
            ctx.addEffect({ sq, type: 'immune', duration: 4, owner: piece.owner })
          }
        }
      }
    }
  },

  moveFilter(moves, state, ctx) {
    const effects = state.effects || []
    return moves.filter(m => {
      const target = state.board[m.to]
      if (!target) return true
      return !effects.some(e => e.sq === m.to && e.type === 'immune')
    })
  },
}
