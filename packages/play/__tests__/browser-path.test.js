// The suite and the manifest probe both reach a game through
// `bootstrap-plugins.js` in Node. The play page does not: it goes through
// `simulator-helper.js` and `game-controller.js`, which look a plugin up for
// themselves. So landlords-game passed every check here and threw in a browser
// with `Plugin "landlords-game" not found after game creation`, because its
// plugin declares `sliceName: 'landlords'` and those call sites compared
// `sliceName` to the family name.
//
// `sliceName === family` appeared in four places. engine#140 trap 1 was closed
// after one of them was fixed. This walks the path the page actually takes.
import '../src/bootstrap-plugins.js'
import '../test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createSimulatorForFamily } from '../src/simulator-helper.js'
import { findFamilyPlugin } from '../src/find-plugin.js'

const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8')
)
const FAMILIES = [...new Set(MANIFEST.filter(e => e.playable).map(e => e.family))]
const FAMILY_FLOOR = 10

describe('every playable family opens on the path the play page takes', () => {
  it('found the families', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(FAMILY_FLOOR)
  })

  it.each(FAMILIES)('%s builds a simulator', (family) => {
    const variant = MANIFEST.find(e => e.family === family && e.playable).variant
    expect(() => createSimulatorForFamily(family, null, { variant })).not.toThrow()
  })
})

describe('the plugin resolver', () => {
  const plugin = (sliceName, extra = {}) => ({ sliceName, getLegalMoves() { return [] }, ...extra })

  it('prefers an exact sliceName match', () => {
    const plugins = [plugin('go'), plugin('chess')]
    expect(findFamilyPlugin(plugins, 'chess').sliceName).toBe('chess')
  })

  // The landlords case: the slice is named for the game, the family for the
  // corpus directory, and they differ.
  it('falls back to the only plugin that implements a game', () => {
    const plugins = [plugin('landlords')]
    expect(findFamilyPlugin(plugins, 'landlords-game').sliceName).toBe('landlords')
  })

  it('matches a declared family before guessing', () => {
    const plugins = [plugin('a'), plugin('landlords', { family: 'landlords-game' })]
    expect(findFamilyPlugin(plugins, 'landlords-game').sliceName).toBe('landlords')
  })

  it('returns null rather than throwing on an empty registry', () => {
    expect(findFamilyPlugin([], 'chess')).toBeNull()
  })
})

describe('no call site compares sliceName to the family name', () => {
  // Four copies, each of which had to be right on its own. One resolver now.
  it.each([
    'packages/play/src/play.js',
    'packages/play/src/simulator-helper.js',
    'packages/play/src/game-controller.js',
    'js/game-play.js',
  ])('%s uses the shared resolver', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
    expect(source).not.toMatch(/sliceName === family/)
    expect(source).toMatch(/findFamilyPlugin\(/)
  })
})
