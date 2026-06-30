export const OFFSETS = {
  knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  king: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  bishop: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  rook: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  queen: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  elephant: [[-2, -2], [-2, 2], [2, -2], [2, 2]],
  camel: [[-3, -1], [-3, 1], [-1, -3], [-1, 3], [1, -3], [1, 3], [3, -1], [3, 1]],
  dabbaba: [[-2, 0], [2, 0], [0, -2], [0, 2]],
  zebra: [[-3, -2], [-3, 2], [-2, -3], [-2, 3], [2, -3], [2, 3], [3, -2], [3, 2]],
}

function resolveLeapOffsets(input) {
  if (typeof input === 'string') return OFFSETS[input] || []
  return input
}

export function rider(dirs, opts = {}) {
  const { maxSteps } = opts
  return {
    type: 'rider',
    dirs,
    maxSteps,
    genMoves(topology, from, board) {
      const rays = topology.rays(from, dirs, maxSteps)
      const moves = []
      for (const ray of rays) {
        for (const pos of ray) {
          const occupant = board[pos]
          if (occupant) {
            if (occupant.enemy) moves.push({ from, to: pos, capture: true })
            break
          }
          moves.push({ from, to: pos })
        }
      }
      return moves
    },
    attacks(topology, from, target, board) {
      const rays = topology.rays(from, dirs, maxSteps)
      for (const ray of rays) {
        for (const pos of ray) {
          if (pos === target) return true
          if (board[pos]) break
        }
      }
      return false
    },
  }
}

export function leaper(offsets) {
  return {
    type: 'leaper',
    offsets,
    genMoves(topology, from, board) {
      const targets = topology.leapTargets(from, resolveLeapOffsets(offsets))
      const moves = []
      for (const pos of targets) {
        const occupant = board[pos]
        if (occupant && occupant.friendly) continue
        if (occupant && occupant.enemy) {
          moves.push({ from, to: pos, capture: true })
        } else {
          moves.push({ from, to: pos })
        }
      }
      return moves
    },
    attacks(topology, from, target) {
      const targets = topology.leapTargets(from, resolveLeapOffsets(offsets))
      return targets.includes(target)
    },
  }
}

export function compose(...primitives) {
  return {
    type: 'compound',
    parts: primitives,
    genMoves(topology, from, board) {
      const moves = []
      for (const p of primitives) {
        const m = p.genMoves(topology, from, board)
        for (const move of m) moves.push(move)
      }
      return moves
    },
    attacks(topology, from, target, board) {
      for (const p of primitives) {
        if (p.attacks(topology, from, target, board)) return true
      }
      return false
    },
  }
}

export function divergent(movePrimitive, capturePrimitive) {
  return {
    type: 'divergent',
    move: movePrimitive,
    capture: capturePrimitive,
    genMoves(topology, from, board) {
      const moves = []
      const mMoves = movePrimitive.genMoves(topology, from, board)
      for (const m of mMoves) {
        if (!m.capture) moves.push(m)
      }
      const cMoves = capturePrimitive.genMoves(topology, from, board)
      for (const m of cMoves) {
        if (m.capture) moves.push(m)
      }
      return moves
    },
    attacks(topology, from, target, board) {
      return capturePrimitive.attacks(topology, from, target, board)
    },
  }
}

export function fromConfig(config) {
  if (config.divergent) {
    return divergent(
      buildPrimitive(config.divergent.move),
      buildPrimitive(config.divergent.capture)
    )
  }
  if (Array.isArray(config)) {
    return compose(...config.map(buildPrimitive))
  }
  return buildPrimitive(config)
}

function buildPrimitive(spec) {
  if (spec.type === 'leaper') return leaper(spec.offsets || spec.dirs)
  if (spec.type === 'rider') return rider(spec.dirs, { maxSteps: spec.maxSteps })
  return spec
}
