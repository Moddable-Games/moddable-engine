// The search does not copy the slice before a simulated move any more, and this
// is the reason it is allowed not to.
//
// `createSimulator` used to run `JSON.parse(JSON.stringify(state))` before
// every single simulated move, defending against a plugin that writes to the
// state it is handed. Profiled, that was 13% of a chess search and a comparable
// share of the garbage collector's work on top. `structuredClone` is not the
// answer: measured on slices this size it is between 0.3x and 1.8x the JSON
// round trip, slower in most families. The saving is in not copying.
//
// Not copying is only safe if `applyMove` really is pure, and "it looks pure"
// is not a thing to bet a game state on. So this plays every playable variant
// and fails if any plugin changes the slice it was given.
//
// A plugin claims this with `pureApplyMove: true` on the object it returns. A
// plugin that does not claim it keeps its defensive copy, so a new family is
// safe by default and only opts in once it is covered here.
import '../../play/src/bootstrap-plugins.js'
import '../../play/test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createGameForFamily } from '../../play/src/play.js'
import { findFamilyPlugin } from '../../play/src/find-plugin.js'

const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8')
)
const PLAYABLE = MANIFEST.filter(e => e.playable).map(e => [e.family, e.variant])
const FAMILIES = [...new Set(PLAYABLE.map(([f]) => f))]

// Floors. A sweep that finds nothing passes, and would be read as proof.
const VARIANT_FLOOR = 190
const FAMILY_FLOOR = 10

const PLIES = 6
const MOVES_PER_PLY = 10

function findsMutation(family, variant) {
  const game = createGameForFamily(family, { variant, rngSeed: 11 })
  const plugin = findFamilyPlugin(game.raw.registry.getPlugins(), family)
  if (!plugin) return `no plugin for ${family}`

  for (let ply = 0; ply < PLIES; ply++) {
    const slice = game.getState().slice
    const moves = game.getLegalMoves()
    if (!moves.length) return null

    for (const move of moves.slice(0, MOVES_PER_PLY)) {
      // The comparison has to reach nested objects, because the shape that
      // would actually bite is a plugin that spreads the slice and then writes
      // through to a field the spread only copied by reference.
      const before = JSON.stringify(slice)
      const full = { __players: { currentIndex: 0, count: 2 }, [plugin.sliceName]: slice }
      try {
        plugin.applyMove(move, slice, full)
      } catch {
        continue    // an illegal move for this seat is not what is under test
      }
      if (JSON.stringify(slice) !== before) {
        return `${family}/${variant} changed its own input on ${JSON.stringify(move)}`
      }
    }
    game.applyMove(moves[0])
  }
  return null
}

describe('applyMove leaves the slice it was given alone', () => {
  it('sweeps enough variants to mean something', () => {
    expect(PLAYABLE.length).toBeGreaterThanOrEqual(VARIANT_FLOOR)
    expect(FAMILIES.length).toBeGreaterThanOrEqual(FAMILY_FLOOR)
  })

  it.each(FAMILIES)('%s declares pureApplyMove', (family) => {
    const variant = PLAYABLE.find(([f]) => f === family)[1]
    const game = createGameForFamily(family, { variant })
    const plugin = findFamilyPlugin(game.raw.registry.getPlugins(), family)
    expect(plugin.pureApplyMove).toBe(true)
  })

  it('no playable variant changes the slice it was handed', () => {
    const found = []
    for (const [family, variant] of PLAYABLE) {
      let result
      try {
        result = findsMutation(family, variant)
      } catch (err) {
        result = `${family}/${variant} threw: ${err.message}`
      }
      if (result) found.push(result)
    }
    expect(found.slice(0, 10)).toEqual([])
    expect(found).toHaveLength(0)
  })
})
