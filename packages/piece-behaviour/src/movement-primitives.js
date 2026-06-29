export const DIRECTIONS = {
  orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  all: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
  knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
}

export function slide(topology, from, directions, board, opts = {}) {
  const { maxSteps, canCapture = true, moveOnly = false, attackOnly = false, blockFn } = opts
  const moves = []
  const [r, c] = topology.toRC(from)

  for (const [dr, dc] of directions) {
    const squares = topology.ray(from, dr, dc, maxSteps)
    for (const sq of squares) {
      if (blockFn && blockFn(sq)) break
      const occupant = board[sq]
      if (occupant) {
        if (canCapture && occupant.enemy && !moveOnly) {
          moves.push({ from, to: sq, capture: true })
        }
        break
      }
      if (!attackOnly) {
        moves.push({ from, to: sq })
      }
    }
  }
  return moves
}

export function leap(topology, from, offsets, board, opts = {}) {
  const { canCapture = true, moveOnly = false, attackOnly = false, blockFn } = opts
  const moves = []
  const [r, c] = topology.toRC(from)

  for (const [dr, dc] of offsets) {
    let nr = r + dr, nc = c + dc
    if (topology.wrap) [nr, nc] = topology.wrapCoords(nr, nc)
    if (!topology.onBoard(nr, nc)) continue
    const sq = topology.toIndex(nr, nc)
    if (blockFn && blockFn(sq)) continue
    const occupant = board[sq]
    if (occupant && occupant.friendly) continue
    if (occupant && occupant.enemy) {
      if (canCapture && !moveOnly) moves.push({ from, to: sq, capture: true })
    } else if (!occupant) {
      if (!attackOnly) moves.push({ from, to: sq })
    }
  }
  return moves
}

export function jump(topology, from, direction, board, opts = {}) {
  const { mustCapture = true } = opts
  const moves = []
  const [r, c] = topology.toRC(from)
  const [dr, dc] = direction

  let nr = r + dr, nc = c + dc
  if (!topology.onBoard(nr, nc)) return moves
  const over = topology.toIndex(nr, nc)
  const occupant = board[over]
  if (!occupant || !occupant.enemy) return moves

  let lr = nr + dr, lc = nc + dc
  if (topology.wrap) [lr, lc] = topology.wrapCoords(lr, lc)
  if (!topology.onBoard(lr, lc)) return moves
  const landing = topology.toIndex(lr, lc)
  if (board[landing]) return moves

  moves.push({ from, to: landing, capture: true, captured: over })
  return moves
}

export function custodian(topology, from, board, opts = {}) {
  const { directions = DIRECTIONS.orthogonal } = opts
  const captures = []
  const [r, c] = topology.toRC(from)

  for (const [dr, dc] of directions) {
    let nr = r + dr, nc = c + dc
    if (!topology.onBoard(nr, nc)) continue
    const adjacent = topology.toIndex(nr, nc)
    if (!board[adjacent] || !board[adjacent].enemy) continue

    let fr = nr + dr, fc = nc + dc
    if (!topology.onBoard(fr, fc)) continue
    const far = topology.toIndex(fr, fc)
    if (board[far] && board[far].friendly) {
      captures.push(adjacent)
    }
  }
  return captures
}
