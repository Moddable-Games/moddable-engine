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
  if (typeof input === 'string') return OFFSETS[input] || input
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

export function hopper(dirs, opts = {}) {
  const { captureSlide = false } = opts
  return {
    type: 'hopper',
    dirs,
    captureSlide,
    genMoves(topology, from, board) {
      const rays = topology.rays(from, dirs)
      const moves = []
      for (const ray of rays) {
        let hurdleFound = false
        for (let i = 0; i < ray.length; i++) {
          const pos = ray[i]
          const occupant = board[pos]
          if (!hurdleFound) {
            if (occupant) { hurdleFound = true }
            continue
          }
          if (captureSlide) {
            if (occupant) {
              if (occupant.enemy) moves.push({ from, to: pos, capture: true })
              break
            }
          } else {
            if (occupant) {
              if (occupant.enemy) moves.push({ from, to: pos, capture: true })
            } else {
              moves.push({ from, to: pos })
            }
            break
          }
        }
      }
      return moves
    },
    attacks(topology, from, target, board) {
      const rays = topology.rays(from, dirs)
      for (const ray of rays) {
        let hurdleFound = false
        for (let i = 0; i < ray.length; i++) {
          const pos = ray[i]
          if (!hurdleFound) {
            if (board[pos]) { hurdleFound = true }
            continue
          }
          if (pos === target) return true
          if (captureSlide) {
            if (board[pos]) break
          } else {
            break
          }
        }
      }
      return false
    },
  }
}

export function fromConfig(config, resolve) {
  if (config.divergent) {
    return divergent(
      buildPrimitive(config.divergent.move, resolve),
      buildPrimitive(config.divergent.capture, resolve)
    )
  }
  if (Array.isArray(config)) {
    return compose(...config.map(c => buildPrimitive(c, resolve)))
  }
  return buildPrimitive(config, resolve)
}

function buildPrimitive(spec, resolve) {
  if (typeof spec === 'string' && resolve) return resolve(spec)
  if (spec.type === 'leaper') return leaper(spec.offsets || spec.dirs)
  if (spec.type === 'rider') return rider(spec.dirs, { maxSteps: spec.maxSteps })
  if (spec.type === 'hopper') return hopper(spec.dirs, { captureSlide: spec.captureSlide })
  if (spec.type === 'compose' && Array.isArray(spec.parts)) {
    const parts = spec.parts.map(p => typeof p === 'string' && resolve ? resolve(p) : buildPrimitive(p, resolve)).filter(Boolean)
    return compose(...parts)
  }
  const keys = spec && typeof spec === 'object' ? Object.keys(spec).join(', ') : String(spec)
  throw new Error(`Unrecognised piece spec: type="${spec?.type}" keys=[${keys}]. Check frontmatter parse output.`)
}
