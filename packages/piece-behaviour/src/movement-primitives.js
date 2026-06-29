/**
 * Movement primitives — topology-agnostic.
 *
 * These functions take traversal results from the topology, not raw coordinates.
 * Each topology provides its own traversal methods (rays, steps, sequences).
 * Piece-behaviour never does coordinate math — it only evaluates positions.
 *
 * The contract between topology and piece-behaviour:
 *   topology.traverse(from, pattern) → ordered position[]
 *
 * Each topology defines what "patterns" it supports (directions, step counts,
 * ring indices, etc). Piece-behaviour doesn't know what those patterns mean —
 * it just iterates the resulting positions and applies game rules (block, capture, pass).
 */

export function slide(traversal, from, board, opts = {}) {
  const { maxSteps, canCapture = true, moveOnly = false, attackOnly = false, blockFn } = opts
  const moves = []

  for (const ray of traversal) {
    let steps = 0
    for (const pos of ray) {
      if (maxSteps && steps >= maxSteps) break
      if (blockFn && blockFn(pos)) break
      const occupant = board[pos]
      if (occupant) {
        if (canCapture && occupant.enemy && !moveOnly) {
          moves.push({ from, to: pos, capture: true })
        }
        break
      }
      if (!attackOnly) {
        moves.push({ from, to: pos })
      }
      steps++
    }
  }
  return moves
}

export function leap(positions, from, board, opts = {}) {
  const { canCapture = true, moveOnly = false, attackOnly = false, blockFn } = opts
  const moves = []

  for (const pos of positions) {
    if (blockFn && blockFn(pos)) continue
    const occupant = board[pos]
    if (occupant && occupant.friendly) continue
    if (occupant && occupant.enemy) {
      if (canCapture && !moveOnly) moves.push({ from, to: pos, capture: true })
    } else if (!occupant) {
      if (!attackOnly) moves.push({ from, to: pos })
    }
  }
  return moves
}

export function jump(pairs, from, board, opts = {}) {
  const moves = []

  for (const { over, landing } of pairs) {
    const occupant = board[over]
    if (!occupant || !occupant.enemy) continue
    if (board[landing]) continue
    moves.push({ from, to: landing, capture: true, captured: over })
  }
  return moves
}

export function custodian(adjacentPairs, from, board) {
  const captures = []

  for (const { adjacent, far } of adjacentPairs) {
    if (!board[adjacent] || !board[adjacent].enemy) continue
    if (board[far] && board[far].friendly) {
      captures.push(adjacent)
    }
  }
  return captures
}

export function advance(sequence, from, steps, board, opts = {}) {
  const { canLandOnOccupied = false } = opts
  if (steps > sequence.length) return []
  const target = sequence[steps - 1]
  if (!target) return []
  if (!canLandOnOccupied && board[target]) return []
  return [{ from, to: target }]
}
