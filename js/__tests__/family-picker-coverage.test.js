// The play page's family picker rendered a six-name literal in play-shared.js.
// The manifest generator had already been fixed to derive its family list from
// the registered plugins, after mancala's six variants shipped invisible, but
// the consumer had not, so hex, mancala, morris and landlords-game were
// playable, present in the manifest, and absent from the dropdown.
//
// These tests assert the property that failure violated: whatever the manifest
// says is playable is what the picker can offer.
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getPlayableFamilies, getFamilyLabel, getPlayabilityManifest, loadPlayabilityManifest,
} from '../play-shared.js'

const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8')
)
const FAMILIES = [...new Set(MANIFEST.filter(e => e.playable).map(e => e.family))]

// A guard that runs against an empty manifest passes and proves nothing.
const FAMILY_FLOOR = 10

beforeAll(async () => {
  global.fetch = async () => ({ ok: true, json: async () => MANIFEST })
  await loadPlayabilityManifest()
})

describe('the family picker covers every playable family', () => {
  it('the manifest was loaded and meets its floor', () => {
    expect(getPlayabilityManifest().length).toBeGreaterThan(150)
    expect(FAMILIES.length).toBeGreaterThanOrEqual(FAMILY_FLOOR)
  })

  it('offers exactly the families the manifest calls playable', () => {
    expect(getPlayableFamilies().sort()).toEqual(FAMILIES.slice().sort())
  })

  // The four that were invisible. Named so that losing one is a failure with
  // its name in it rather than a count that quietly drops.
  it.each(['hex', 'mancala', 'morris', 'landlords-game'])('offers %s', (family) => {
    expect(getPlayableFamilies()).toContain(family)
  })

  it('gives every family a display name that is not its slug', () => {
    const unnamed = getPlayableFamilies().filter(f => getFamilyLabel(f) === f)
    expect(unnamed).toEqual([])
  })

  it('names the four correctly', () => {
    expect(getFamilyLabel('morris')).toBe("Nine Men's Morris")
    expect(getFamilyLabel('landlords-game')).toBe("The Landlord's Game")
    expect(getFamilyLabel('mancala')).toBe('Mancala')
    expect(getFamilyLabel('hex')).toBe('Hex')
  })
})

describe('no page restates the family list', () => {
  // The literal lived in three files and each copy went stale independently.
  it.each(['play-shared.js', 'game-play.js', 'create.js'])('%s builds its picker from the manifest', (file) => {
    const source = readFileSync(join(process.cwd(), 'js', file), 'utf8')
    const literal = /\[\s*'(chess|go|draughts)'\s*,(\s*'[a-z-]+'\s*,?){3,}\]/
    expect(source).not.toMatch(literal)
  })
})
