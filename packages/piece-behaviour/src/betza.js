/**
 * Betza notation to piece specs.
 *
 * The large historical variants publish their movement as extended Betza, and
 * the corpus transcribes it that way: Tenjiku declares 36 piece types, Taikyoku
 * 207. Writing those out as offset tables by hand is not authoring, it is
 * copying with a chance to make a mistake per piece - so the notation the
 * source already uses becomes the thing the engine reads.
 *
 * This emits the same spec shapes `fromConfig` already builds, so nothing
 * downstream learns a new vocabulary: a Betza string is another way to spell a
 * leaper or a rider, not a new kind of piece.
 *
 * The grammar here is the subset the corpus actually uses. Everything else
 * throws by name. That is deliberate: a movement notation that quietly
 * approximates what it cannot read would put a piece on the board moving a way
 * no source describes, and there would be nothing to notice it by.
 */

// Forward is row -1, matching the offset convention in every pieceMoves block
// in the corpus; seat rotation is the plugin's job, not this file's.
const ORTH = { f: [-1, 0], b: [1, 0], l: [0, -1], r: [0, 1] }

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
const DABBABA = [[-2, 0], [2, 0], [0, -2], [0, 2]]
const ALFIL = [[-2, -2], [-2, 2], [2, -2], [2, 2]]

// A modifier keeps the offsets pointing its way, judged on the offset's longer
// component. Written as a predicate rather than a per-atom table so the jumping
// atoms need no lists of their own.
//
// The longer component is what makes this right for oblique leaps. A knight's
// (-2,-1) is a forward move and its (-1,-2) is a leftward one, so a plain
// "dr < 0" test would call both of them forward and `vN` - the vertical knight
// that Wa Shogi's Heavenly Horse promotes into - would come out as an ordinary
// knight with all eight jumps. On a symmetric offset like a ferz's (-1,-1)
// neither component is longer, so it belongs to the forward half and the left
// half both, which is exactly what Betza's `fF` and `lF` mean.
//
// This is narrower than strict Betza, where one modifier on an oblique atom
// gives four directions and a doubled one narrows to two. The corpus's sources
// use the narrow reading: Wikipedia writes Wa Shogi's heavenly horse `fbN` and
// describes it as "one square forward plus one square diagonally forward; or,
// one square backward plus one square diagonally backward" - four jumps, not
// eight. Tenjiku spells its shogi knight `ffN`, which lands on the same two
// squares under either reading, so nothing in the corpus needs the wide one.
const HALF = {
  f: ([dr, dc]) => dr < 0 && Math.abs(dr) >= Math.abs(dc),
  b: ([dr, dc]) => dr > 0 && Math.abs(dr) >= Math.abs(dc),
  l: ([dr, dc]) => dc < 0 && Math.abs(dc) >= Math.abs(dr),
  r: ([dr, dc]) => dc > 0 && Math.abs(dc) >= Math.abs(dr),
}

const key = (o) => o.join(',')
const dedupe = (offsets) => {
  const seen = new Map()
  for (const o of offsets) seen.set(key(o), o)
  return [...seen.values()]
}

function directionsFor(atom, mods) {
  const all = {
    W: Object.values(ORTH),
    F: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    K: [...Object.values(ORTH), [-1, -1], [-1, 1], [1, -1], [1, 1]],
    R: Object.values(ORTH),
    B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    Q: [...Object.values(ORTH), [-1, -1], [-1, 1], [1, -1], [1, 1]],
    N: KNIGHT,
    D: DABBABA,
    A: ALFIL,
  }[atom]

  if (!all) throw new Error(`Betza: unknown atom "${atom}"`)
  if (!mods.length) return all

  // Several modifiers are a union, not an intersection: `fb` is forward and
  // backward, which is what `v` abbreviates.
  const kept = []
  for (const m of mods) {
    const test = HALF[m]
    if (!test) throw new Error(`Betza: unknown modifier "${m}"`)
    for (const o of all) if (test(o)) kept.push(o)
  }
  if (!kept.length) {
    throw new Error(`Betza: modifiers "${mods.join('')}" leave atom "${atom}" with no directions`)
  }
  return dedupe(kept)
}

// Atoms that always jump, so a step count would mean something this does not
// model; and atoms that always slide, whose absent count means unlimited.
const JUMPERS = new Set(['N', 'D', 'A'])
const SLIDERS = new Set(['R', 'B', 'Q'])

const TERM = /^([fblrvs]*)([WFKRBQNDA])(\d*)/
// `R(>=2)` is a rook that must travel at least two squares; `R(2<=n<=3)` bounds
// it at both ends. Tenjiku's heavenly tetrarch is written this way.
const RANGED = /^([fblrvs]*)([WFKRBQNDA])\((?:>=(\d+)|(\d+)<=n<=(\d+))\)/
// `[a3K]` is up to three steps; `[aK]` is the two-step default.
// `f[avF]` - modifiers before the bracket steer the first leg, those inside
// steer the continuation, and the atom after `a` is shared by both.
const CHAIN = /^([fblrs]*)\[([fblrvsm]*)([WFKRBQNDA])?a([fblrvsm]*)(\d*)([WFKRBQNDA])\]/
const SHOOT = /^c?x([fblrvs]*)([WFKRBQNDA])/
// `RmaR` and `BmaB`: move as a rook (or bishop), then again perpendicular.
// Maka-Dai-Dai's hook mover and Capricorn, "any number of free squares in one
// of the four orthogonal directions, then any number of free squares in a
// perpendicular direction".
const HOOK = /^([RB])ma\1/
// `[fl]` `[fr]` `[bl]` `[br]` name one diagonal each, and stack: the left
// chariot's `[fl][br]B` is a bishop on two opposite diagonals only.
const CORNER = /^((?:\[(?:fl|fr|bl|br)\])+)([WFKRBQNDA])/
const CORNERS = { fl: [-1, -1], fr: [-1, 1], bl: [1, -1], br: [1, 1] }
// `cpp` - capture-only, hopping with no limit on how many pieces.
const RANGE = /^cpp([fblrvs]*)([WFKRBQNDA])/

function expandModifiers(raw) {
  const out = []
  for (const c of raw) {
    if (c === 'v') out.push('f', 'b')
    else if (c === 's') out.push('l', 'r')
    else out.push(c)
  }
  return out
}

/**
 * Compile one Betza string into a spec `fromConfig` accepts.
 * Returns a single spec, or an array of specs to compose.
 */
export function betzaToSpec(notation) {
  if (typeof notation !== 'string' || !notation.trim()) {
    throw new Error(`Betza: expected a notation string, got ${JSON.stringify(notation)}`)
  }

  const source = notation.trim()
  const specs = []
  let rest = source

  while (rest.length) {
    // `[aK]` is the chaining operator: the source defines `xxxaK` as "an xxxK
    // move possibly followed by a yyyK move, not necessarily in the same
    // direction", and the brackets say what is being chained - `DaK` is a
    // dabbaba then a king step, `D[aK]` a dabbaba OR twice as a king. Chu
    // Shogi's Lion is `NAD[aK]`: a jump to any square two away, or two King
    // steps that may each capture.
    // `U` is the universal leaper - any square on the board.
    if (rest[0] === 'U') {
      rest = rest.slice(1)
      specs.push({ type: 'universal' })
      continue
    }

    const hook = HOOK.exec(rest)
    if (hook) {
      rest = rest.slice(hook[0].length)
      specs.push({
        type: 'bent',
        first: hook[1] === 'R' ? 'orthogonal' : 'diagonal',
        firstSteps: 'any',
        second: 'perpendicular',
        minSecondLeg: 0,
      })
      continue
    }

    const corner = CORNER.exec(rest)
    if (corner) {
      rest = rest.slice(corner[0].length)
      const picked = (corner[1].match(/fl|fr|bl|br/g) || []).map(k => CORNERS[k])
      const atom = corner[2]
      if (!'FBQ'.includes(atom)) {
        throw new Error(`Betza: "${corner[0]}" in "${source}" - a named corner applies to a diagonal atom`)
      }
      specs.push(SLIDERS.has(atom)
        ? { type: 'rider', dirs: picked, directional: true }
        : { type: 'leaper', offsets: picked, directional: true })
      continue
    }

    // `cpp` is a range jump: it slides, may pass over pieces, and only to
    // capture. Which pieces it may pass over is a property of the game rather
    // than of the notation, so the rank table is attached by the plugin.
    const range = RANGE.exec(rest)
    if (range) {
      const [whole, rawMods, atom] = range
      rest = rest.slice(whole.length)
      const mods = expandModifiers(rawMods)
      specs.push({
        type: 'rangeCapture',
        dirs: directionsFor(atom, mods),
        ...(mods.length ? { directional: true } : {}),
      })
      continue
    }

    // `x` is shooting: a capture of an adjacent piece with no move at all.
    const shot = SHOOT.exec(rest)
    if (shot) {
      const [whole, rawMods, atom] = shot
      rest = rest.slice(whole.length)
      const mods = expandModifiers(rawMods)
      specs.push({
        type: 'shoot',
        dirs: directionsFor(atom, mods),
        ...(mods.length ? { directional: true } : {}),
      })
      continue
    }

    const chain = CHAIN.exec(rest)
    if (chain) {
      const [whole, leadMods, firstMods, firstAtom, contMods, count, atom] = chain
      rest = rest.slice(whole.length)

      // The atom before `a` is the first leg and the one after it the
      // continuation; `[aK]` names only the continuation and the two are the
      // same step. Where they differ this cannot express it, so it says so
      // rather than picking one.
      if (firstAtom && firstAtom !== atom) {
        throw new Error(
          `Betza: "${whole}" in "${source}" - a chain whose legs are different atoms is not modelled`
        )
      }

      // `v` means something different inside a continuation leg. The source
      // defines it there as "restricted to a single line ... interpreted
      // relative to the piece's current position on its path", so `f[avF]` is
      // two squares along one forward diagonal rather than a leg that may turn.
      // Read as plain "vertical" it would give a soaring eagle a move no
      // source describes.
      const sameLine = contMods.includes('v')

      // `m` is move-only. The reading guide gives `mKa3K` as "up to three king
      // steps that must stop on first capture", so the walk passes through
      // empty squares and takes nothing on the way.
      const quiet = firstMods.includes('m') || contMods.includes('m')

      // Directions come from the first leg. With `sameLine` the continuation
      // follows whichever of them the piece took, so one set serves both.
      const mods = expandModifiers(leadMods + (firstMods + contMods).replace(/[vm]/g, ''))

      if (JUMPERS.has(atom) || SLIDERS.has(atom)) {
        throw new Error(
          `Betza: "${whole}" in "${source}" - chaining is modelled for stepping atoms only. ` +
          `A chained jump or slide needs a leg shape this does not have.`
        )
      }

      specs.push({
        type: 'area',
        dirs: directionsFor(atom, mods),
        steps: count ? Number(count) : 2,
        ...(sameLine ? { sameLine: true } : {}),
        ...(quiet ? { quiet: true } : {}),
        ...(mods.length ? { directional: true } : {}),
      })
      continue
    }

    const ranged = RANGED.exec(rest)
    if (ranged) {
      const [whole, rawMods, atom, atLeast, lo, hi] = ranged
      rest = rest.slice(whole.length)
      if (!SLIDERS.has(atom)) {
        throw new Error(`Betza: "${whole}" in "${source}" - a step range on a non-sliding atom is not modelled`)
      }
      const mods = expandModifiers(rawMods)
      specs.push({
        type: 'rider',
        dirs: directionsFor(atom, mods),
        minSteps: Number(atLeast || lo),
        ...(hi ? { maxSteps: Number(hi) } : {}),
        ...(mods.length ? { directional: true } : {}),
      })
      continue
    }

    const match = TERM.exec(rest)
    if (!match) {
      throw new Error(
        `Betza: cannot read "${rest}" in "${source}". ` +
        `This parser covers modifiers f b l r v s over atoms W F K R B Q N D A with an optional step count. ` +
        `Chaining is read as [aK] and [a3K]; bare \`a\` outside brackets, hopping (p), shooting (x) and move/capture split (m/c) are not modelled - ` +
        `declare that piece with an explicit pieceMoves entry instead.`
      )
    }
    const [whole, rawMods, atom, count] = match
    rest = rest.slice(whole.length)

    const mods = expandModifiers(rawMods)
    const dirs = directionsFor(atom, mods)
    const steps = count ? Number(count) : null

    if (steps !== null && JUMPERS.has(atom)) {
      throw new Error(`Betza: "${atom}${count}" in "${source}" - a step count on a jumping atom is not modelled`)
    }

    // Forward is only meaningful to a seat, so a term that used f/b/l/r rotates
    // with its owner. Marked per term rather than per string: in `FAvWvD` only
    // the last two legs are directional, and a symmetric leg carrying the flag
    // would be rotating a set onto itself for no reason.
    const seat = mods.length ? { directional: true } : {}

    if (SLIDERS.has(atom)) {
      specs.push({ type: 'rider', dirs, ...(steps ? { maxSteps: steps } : {}), ...seat })
    } else if (steps) {
      // A counted stepper is a short slider: bW2 is two backward squares, and
      // it may not jump the first one.
      specs.push({ type: 'rider', dirs, maxSteps: steps, ...seat })
    } else {
      specs.push({ type: 'leaper', offsets: dirs, ...seat })
    }
  }

  return specs.length === 1 ? specs[0] : specs
}
