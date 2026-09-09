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
const DIAG = { f: [[-1, -1], [-1, 1]], b: [[1, -1], [1, 1]], l: [[-1, -1], [1, -1]], r: [[-1, 1], [1, 1]] }

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
    const match = TERM.exec(rest)
    if (!match) {
      throw new Error(
        `Betza: cannot read "${rest}" in "${source}". ` +
        `This parser covers modifiers f b l r v s over atoms W F K R B Q N D A with an optional step count. ` +
        `Chaining (a), grouping ([]), hopping (p), shooting (x) and move/capture split (m/c) are not modelled - ` +
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
