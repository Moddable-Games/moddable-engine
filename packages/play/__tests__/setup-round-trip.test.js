// A position written by `boardToSetup` and handed back as the variant's
// `setup` has to rebuild the same board. That is how a consumer saves a game and
// loads it again (moddable-tools' `play_load_fen`, the create page's "Try in
// Play"), and engine#202 found these variants where it did not:
//
//   hex, morris      the plugins never read a setup, so every stone vanished
//   halma            a `start` list in the plugin block won over the setup
//   stern-halma,     the board holds only occupied cells, so a moved piece
//   asalto           came out last and the same position wrote a new string
//   landlords-game   the tokens' squares were written and never read
//   seven chess      a copy of the opening in the plugin block overrode the
//   variants         position the caller passed
//   pallanguzhi      seeds held aside were written in the store's slot and
//                    dropped on the way back in
//   shogi            a promoted piece was written `[+P]` and came back
//                    unpromoted, or promoted a different piece
//
// Every playable variant is played a few moves, and after each one its
// position is written, loaded into a new game and written again.
import '../../play/src/bootstrap-plugins.js'
import '../../play/test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createGameForFamily, resolveFromDisk } from '../../play/src/play.js'
import { findFamilyPlugin, familySliceKey } from '../../play/src/find-plugin.js'
import { definitionFromResolved } from '../../play/src/variant-definition.js'
import { getVariantConfig } from '../../play/src/variant-registry.js'
import { boardToSetup } from '../../play/src/serialise.js'

const MANIFEST = JSON.parse(readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8'))
const PLAYABLE = MANIFEST.filter(e => e.playable)

// Floors. A sweep that finds nothing passes, and would be read as proof.
const ROUND_TRIP_FLOOR = 250
const FAMILY_FLOOR = 20

const PLIES = 4

// Variants whose position a setup string cannot carry, and why. Each must still
// fail, so an entry is removed when the variant is fixed rather than left to
// excuse a regression.
const CANNOT_CARRY = new Map([
  ['xiangqi/banqi', 'which pieces are face down, and what lies under them, is not in the string'],
])

// Variants the engine does not yet load a written position for, each with the
// issue that tracks it. Held to the same rule: an entry that passes fails.
const KNOWN_GAPS = new Map([
  ['royal-ur/standard', 'engine#206'],
  ['senet/standard', 'engine#206'],
  ['pachisi/standard', 'engine#206'],
  ['pachisi/seven-shell', 'engine#206'],
  ['pachisi/two-player', 'engine#206'],
  ['chaupar/standard', 'engine#206'],
  ['nyout/standard', 'engine#206'],
])
const EXCUSED = new Set([...CANNOT_CARRY.keys(), ...KNOWN_GAPS.keys()])

function positionOf(game, family, resolved) {
  const plugins = game.raw.registry.getPlugins()
  const slice = game.raw.getState(familySliceKey(plugins, family))
  const vocabulary = findFamilyPlugin(plugins, family)?.vocabulary || {}
  const setup = boardToSetup(slice, resolved.topology || {}, vocabulary, { players: game.raw.definition.players.names })
  const written = Array.isArray(setup) ? setup.length > 0 : typeof setup === 'string' && setup !== ''
  return written ? setup : null
}

// The first place the round trip breaks, or null. `checked` counts the
// positions that were actually written and compared.
function roundTrip({ family, variant, key }, checked) {
  const resolved = resolveFromDisk(family, variant)
  const registry = getVariantConfig(family, key) || {}
  const load = (setup) => createGameForFamily(family, {
    variant, rngSeed: 7,
    definition: definitionFromResolved(family, variant, setup === undefined ? resolved : { ...resolved, setup }, registry),
  })
  const game = load()
  for (let ply = 1; ply <= PLIES; ply++) {
    const moves = game.getLegalMoves()
    if (!moves.length) return null
    game.applyMove(moves[0])
    const written = positionOf(game, family, resolved)
    if (written === null) continue
    checked.count++
    const again = positionOf(load(written), family, resolved)
    if (JSON.stringify(again) !== JSON.stringify(written)) {
      return `after ${ply} move(s) wrote ${JSON.stringify(written)}, loading it gave ${JSON.stringify(again)}`
    }
  }
  return null
}

describe('a written position loads back as the same board (engine#202)', () => {
  const failures = new Map()
  const checked = { count: 0 }
  const families = new Set()

  beforeAll(() => {
    for (const entry of PLAYABLE) {
      const id = `${entry.family}/${entry.variant}`
      let failure
      const before = checked.count
      try {
        failure = roundTrip(entry, checked)
      } catch (error) {
        failure = `threw: ${error.message}`
      }
      if (failure) failures.set(id, failure)
      if (checked.count > before) families.add(entry.family)
    }
  })

  it('covers enough variants and families to mean something', () => {
    expect(checked.count).toBeGreaterThanOrEqual(ROUND_TRIP_FLOOR)
    expect(families.size).toBeGreaterThanOrEqual(FAMILY_FLOOR)
  })

  it('every variant a setup string can describe round-trips', () => {
    const unexpected = [...failures].filter(([id]) => !EXCUSED.has(id)).map(([id, why]) => `${id}: ${why}`)
    expect(unexpected).toEqual([])
  })

  it('every declared exception still fails, so none outlives its fix', () => {
    const fixed = [...EXCUSED].filter(id => !failures.has(id))
    expect(fixed).toEqual([])
  })
})
