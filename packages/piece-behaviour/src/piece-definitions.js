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
  const { maxSteps, minSteps = 1 } = opts
  return {
    type: 'rider',
    dirs,
    maxSteps,
    minSteps,
    genMoves(topology, from, board) {
      const rays = topology.rays(from, dirs, maxSteps)
      const moves = []
      for (const ray of rays) {
        for (let i = 0; i < ray.length; i++) {
          const pos = ray[i]
          const occupant = board[pos]
          if (occupant) {
            if (occupant.enemy && i + 1 >= minSteps) moves.push({ from, to: pos, capture: true })
            break
          }
          if (i + 1 >= minSteps) moves.push({ from, to: pos })
        }
      }
      return moves
    },
    attacks(topology, from, target, board) {
      const rays = topology.rays(from, dirs, maxSteps)
      for (const ray of rays) {
        for (let i = 0; i < ray.length; i++) {
          const pos = ray[i]
          if (pos === target) return i + 1 >= minSteps
          if (board[pos]) break
        }
      }
      return false
    },
  }
}

// The square that blocks a lame leaper for a given offset.
//   'half'       the midpoint, for even offsets. The Xiangqi Elephant (2,2) is
//                blocked at (1,1).
//   'orthogonal' one unit step along the longer axis. The Xiangqi Horse (2,1)
//                is blocked at (1,0).
function lameBlockOffset(mode, dr, dc) {
  if (mode === 'half') {
    if (dr % 2 !== 0 || dc % 2 !== 0) return null
    return [dr / 2, dc / 2]
  }
  if (Math.abs(dr) > Math.abs(dc)) return [Math.sign(dr), 0]
  if (Math.abs(dc) > Math.abs(dr)) return [0, Math.sign(dc)]
  return null
}

export function leaper(offsets, opts = {}) {
  const { lame = null } = opts

  // A lame leaper is blocked by an occupied square on the way, so it must be
  // resolved offset by offset rather than through a single leapTargets call.
  function lameTargets(topology, from, board) {
    const resolved = resolveLeapOffsets(offsets)
    if (!Array.isArray(resolved)) return topology.leapTargets(from, resolved)
    const out = []
    for (const [dr, dc] of resolved) {
      const target = topology.leapTargets(from, [[dr, dc]])[0]
      if (target === undefined) continue
      const blockOffset = lameBlockOffset(lame, dr, dc)
      if (blockOffset) {
        const blocker = topology.leapTargets(from, [blockOffset])[0]
        if (blocker !== undefined && board[blocker]) continue
      }
      out.push(target)
    }
    return out
  }

  return {
    type: 'leaper',
    offsets,
    lame,
    genMoves(topology, from, board) {
      const targets = lame
        ? lameTargets(topology, from, board)
        : topology.leapTargets(from, resolveLeapOffsets(offsets))
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
    attacks(topology, from, target, board) {
      const targets = lame
        ? lameTargets(topology, from, board || [])
        : topology.leapTargets(from, resolveLeapOffsets(offsets))
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

/**
 * Keep only the captures, and only of the pieces this one is allowed to take.
 *
 * Congo's Lions capture each other at range: "if there is a vertical or
 * diagonal line with no pieces between the two lions, the lion may jump to the
 * other lion and capture it". A rider already stops at the first piece it
 * meets, so the line-of-sight is free; what is needed is that it may take that
 * piece only when it is the other Lion, and may not simply move along the line.
 *
 * `allows` is a predicate over the victim, so this says nothing about Lions.
 */
export function targeted(primitive, allows) {
  return {
    type: 'targeted',
    inner: primitive,
    genMoves(topology, from, board) {
      return primitive.genMoves(topology, from, board)
        .filter(m => m.capture && allows(board[m.to]))
    },
    attacks(topology, from, target, board) {
      if (!allows(board[target])) return false
      return primitive.attacks(topology, from, target, board)
    },
  }
}

/**
 * A ray that turns instead of stopping when it runs out of board.
 *
 * Rollerball's Rook on g1 sweeps the whole of rank 1, reaches the corner at a1,
 * turns, and carries on up the entire a-file. Every other primitive walks a
 * fixed direction until a piece or an edge stops it; this one keeps going in a
 * new direction, a declared number of times.
 *
 * `at` decides where a turn is allowed - Rollerball permits it only on the four
 * corners of the board, so a slide that merely reaches an edge stops there. Like
 * every other predicate here it is a plain function over a cell, so this knows
 * nothing about corners, rings or racetracks.
 *
 * `turn` is a quarter turn of the direction vector: 'cw' takes north to east,
 * east to south and so on, which is the way play runs around a ring.
 */
export function reboundRider(dirs, opts = {}) {
  const { turn = 'cw', at = null, maxRebounds = 1 } = opts
  const dirList = Array.isArray(dirs) ? dirs : []

  // 'cw' and 'ccw' are quarter turns of the direction vector: the Rook reaches
  // a corner and carries on around the ring.
  //
  // 'reflect' is a bounce off a wall, which is a different question, because it
  // has to know WHICH wall. A diagonal stopped by the hole in the middle of
  // Rollerball's board is stopped by one of its two components: whichever of
  // them cannot be taken on its own is the one that flips. A ray running up-left
  // into the hole's bottom edge can still go left, so it is the upward half that
  // reverses and the ray continues down-left.
  function nextDirection(topology, at_, [dr, dc]) {
    if (turn === 'ccw') return [-dc, dr]
    if (turn !== 'reflect') return [dc, -dr]
    const open = (d) => (((topology.rays(at_, [d]) || [])[0] || []).length > 0)
    if (!open([dr, 0])) return [-dr, dc]
    if (!open([0, dc])) return [dr, -dc]
    return null
  }

  function walk(topology, from, board) {
    const moves = []
    for (const start of dirList) {
      let cursor = from
      let d = start
      let rebounds = 0
      let blocked = false
      // Guarded rather than `while (true)`: a rebound that returned to where it
      // started would otherwise circle the board for ever.
      for (let leg = 0; leg <= maxRebounds && !blocked; leg++) {
        const ray = (topology.rays(cursor, [d]) || [])[0] || []
        for (const pos of ray) {
          const occupant = board[pos]
          if (occupant) {
            if (occupant.enemy) moves.push({ from, to: pos, capture: true })
            blocked = true
            break
          }
          moves.push({ from, to: pos })
        }
        if (blocked || leg === maxRebounds) break
        // A rebound follows travel. A piece already standing on a corner has
        // not reached one, and letting a zero-length ray turn made a Rook on g1
        // generate the whole of rank 1 twice - once sliding, once "rebounding"
        // out of a direction it could not move in at all.
        if (!ray.length) break
        const end = ray[ray.length - 1]
        if (at && !at(end)) break
        const turned = nextDirection(topology, end, d)
        if (!turned) break
        cursor = end
        d = turned
      }
    }
    return moves
  }

  return {
    type: 'rebound-rider',
    dirs: dirList,
    genMoves(topology, from, board) {
      return walk(topology, from, board)
    },
    attacks(topology, from, target, board) {
      return walk(topology, from, board).some(m => m.to === target)
    },
  }
}

/**
 * Move differently depending on where the piece is standing.
 *
 * Every primitive above answers "how does this piece move?" with one answer for
 * the whole board. Some games do not work that way. Congo's Crocodile has a
 * king step everywhere, plus a rook slide along its file TOWARD the river when
 * it is outside the water and ALONG the river once it is in. Rollerball's board
 * is a racetrack and forward means clockwise, so which way forward points
 * depends on which side of the ring the piece is on.
 *
 * That is not a property of the piece and not a property of the seat. It is a
 * property of the square the piece is standing on, which is the thing no
 * primitive could express.
 *
 * `cases` are tried in order and the first whose `where` accepts the origin
 * wins; a case with no `where` is the fallback. `where` is a plain predicate
 * over a cell, so this knows nothing about grids, rivers or racetracks.
 */
export function positional(cases) {
  const pick = (from) => {
    for (const c of cases) {
      if (!c.where || c.where(from)) return c.primitive
    }
    return null
  }
  return {
    type: 'positional',
    cases,
    genMoves(topology, from, board) {
      const primitive = pick(from)
      return primitive ? primitive.genMoves(topology, from, board) : []
    },
    attacks(topology, from, target, board) {
      const primitive = pick(from)
      return primitive ? primitive.attacks(topology, from, target, board) : false
    },
  }
}

/**
 * Keep only the moves that land somewhere the piece is allowed to be.
 *
 * Congo's Lion moves as a king and may never leave its own 3x3 castle. Xiangqi's
 * General and Advisor may never leave the palace. Quang Trung's General and
 * Pawns are held to the middle files. Three games, one idea, and until now the
 * only implementation lived inside the xiangqi plugin, where the chess plugin
 * could not reach it and where it knew about palaces specifically.
 *
 * `allows` is a plain predicate over a cell, so this stays a question about
 * movement rather than about grids: whoever builds the piece decides what the
 * region is and how a cell is tested against it.
 */
export function confine(primitive, allows) {
  return {
    type: 'confined',
    inner: primitive,
    genMoves(topology, from, board) {
      return primitive.genMoves(topology, from, board).filter(m => allows(m.to))
    },
    attacks(topology, from, target, board) {
      // A piece that cannot legally reach a square does not attack it, which is
      // what keeps a confined royal from giving check across the board.
      if (!allows(target)) return false
      return primitive.attacks(topology, from, target, board)
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

// A bent rider: one or more steps along a first direction, then an unlimited
// slide "outward" along the component directions of that first leg.
// This is the Aanca / Gryphon / Eagle family (metamachy Eagle, grande-acedrex Griffion).
export function bent(opts = {}) {
  const { first = 'diagonal', firstSteps = 1, minSecondLeg = 0, second = null, secondSteps = null } = opts
  // `diagonal` and `orthogonal` are what frontmatter says; `bishop` and `rook`
  // are what the offset table calls them. Without the aliases `first:
  // orthogonal` fell through to the default and turned the wrong way in
  // silence.
  const FAMILY = { diagonal: 'bishop', orthogonal: 'rook' }
  const firstDirs = typeof first === 'string'
    ? (OFFSETS[FAMILY[first] || first] || OFFSETS.bishop)
    : first

  // Which way the move turns after its first leg.
  //
  // The xiangqi cannon and elephant start diagonally and continue orthogonally,
  // which is what this did and still does by default. Janggi's elephant is the
  // other way round - one orthogonal step, then two diagonal steps outward -
  // so `second: 'diagonal'` turns the corner the other way, and the outward
  // diagonals are the two that keep going away from where the piece started.
  function continuations(dr, dc) {
    if (second !== 'diagonal') {
      const out = []
      if (dr !== 0) out.push([dr, 0])
      if (dc !== 0) out.push([0, dc])
      return out
    }
    if (dr !== 0 && dc !== 0) return [[dr, dc]]
    return dr !== 0 ? [[dr, -1], [dr, 1]] : [[-1, dc], [1, dc]]
  }

  function legs(topology, from, board) {
    const out = []
    for (const [dr, dc] of firstDirs) {
      const knee = topology.rays(from, [[dr, dc]], firstSteps)[0]
      if (!knee || knee.length < firstSteps) continue
      const kneePos = knee[firstSteps - 1]
      // the knee square itself is a legal destination, and blocks if occupied
      const blocked = !!board[kneePos]
      out.push({ kneePos, blocked, continues: continuations(dr, dc) })
    }
    return out
  }

  return {
    type: 'bent',
    first,
    firstSteps,
    minSecondLeg,
    genMoves(topology, from, board) {
      const moves = []
      for (const { kneePos, blocked, continues } of legs(topology, from, board)) {
        const at = board[kneePos]
        if (at) {
          // the knee is occupied: it blocks the whole ray. It is a capture
          // target only when the second leg has no minimum.
          if (at.enemy && minSecondLeg === 0 && !secondSteps) moves.push({ from, to: kneePos, capture: true })
          continue
        }
        // With an exact second leg the knee is a square passed over, never a
        // square landed on: a Janggi Elephant does not stop after one step.
        if (minSecondLeg === 0 && !secondSteps) moves.push({ from, to: kneePos })
        if (blocked) continue
        for (const ray of topology.rays(kneePos, continues, secondSteps || undefined)) {
          for (let i = 0; i < ray.length; i++) {
            const pos = ray[i]
            const occ = board[pos]
            const landing = secondSteps ? i + 1 === secondSteps : i + 1 >= minSecondLeg
            if (occ) {
              // A piece short of the landing square blocks the path rather than
              // offering itself: Janggi's elephant is stopped by anything on
              // either of the two squares it passes over.
              if (occ.enemy && landing) moves.push({ from, to: pos, capture: true })
              break
            }
            if (landing) moves.push({ from, to: pos })
          }
        }
      }
      return moves
    },
    attacks(topology, from, target, board) {
      return this.genMoves(topology, from, board).some(m => m.to === target)
    },
  }
}

export function locust(dirs) {
  return {
    type: 'locust',
    dirs,
    genMoves(topology, from, board) {
      if (!topology.jumpPairs) return []
      const moves = []
      for (const { over, landing } of topology.jumpPairs(from, dirs)) {
        const occupant = board[over]
        if (!occupant || !occupant.enemy) continue
        if (board[landing]) continue
        moves.push({ from, to: landing, capture: true, captured: over })
      }
      return moves
    },
    attacks(topology, from, target, board) {
      if (!topology.jumpPairs) return false
      for (const { over, landing } of topology.jumpPairs(from, dirs)) {
        if (over !== target) continue
        if (board[landing]) continue
        return true
      }
      return false
    },
  }
}

export function hopper(dirs, opts = {}) {
  const { captureSlide = false, moveSlide = false } = opts
  return {
    type: 'hopper',
    dirs,
    captureSlide,
    moveSlide,
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
          if (captureSlide || moveSlide) {
            if (occupant) {
              if (occupant.enemy) moves.push({ from, to: pos, capture: true })
              break
            }
            if (moveSlide) moves.push({ from, to: pos })
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
          if (captureSlide || moveSlide) {
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
  if (spec.type === 'leaper') return leaper(spec.offsets || spec.dirs, { lame: spec.lame })
  if (spec.type === 'rider') return rider(spec.dirs, { maxSteps: spec.maxSteps, minSteps: spec.minSteps })
  if (spec.type === 'hopper') return hopper(spec.dirs, { captureSlide: spec.captureSlide, moveSlide: spec.moveSlide })
  if (spec.type === 'locust') return locust(resolveLeapOffsets(spec.dirs || spec.offsets))
  if (spec.type === 'bent') return bent({ first: spec.first, firstSteps: spec.firstSteps, minSecondLeg: spec.minSecondLeg, second: spec.second, secondSteps: spec.secondSteps })
  if (spec.type === 'compose' && Array.isArray(spec.parts)) {
    const parts = spec.parts.map(p => typeof p === 'string' && resolve ? resolve(p) : buildPrimitive(p, resolve)).filter(Boolean)
    return compose(...parts)
  }
  const keys = spec && typeof spec === 'object' ? Object.keys(spec).join(', ') : String(spec)
  throw new Error(`Unrecognised piece spec: type="${spec?.type}" keys=[${keys}]. Check frontmatter parse output.`)
}
