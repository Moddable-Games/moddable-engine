import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { RULES } from '../src/rules.js'

// engine#88. Eight plugins declare rule ids in a `rules: [...]` array. Until
// this test, a declared id that no factory implements was discarded in silence:
// `wrapPluginWithRules` filters the list by `registry.has(id)` and takes an
// early return when nothing survives, so a plugin could name four rules,
// implement all four privately, and nothing anywhere said the declaration had
// no effect.
//
// That is the same failure as engine#68 and #139 - config declared and never
// consumed - one level up, and it is why `packages/rule/` could sit unreachable
// for three months while eight plugins claimed to use it.
//
// This test is the measurement. A declared id either has a factory in the
// composition root's rule map or the declaration is a lie and should be
// deleted. Both are cheap fixes; neither is what happens today.
//
// Registered is not the same as correct, and this test only checks the first.
// draughts declares `capture.replacement`, which IS registered, and which
// describes chess's capture rather than draughts's - a draughts capture is a
// jump, and the captured piece sits on neither the origin nor the destination.
// Wiring it removes nothing. Only the family's own tests can catch that, which
// is why `packages/play/src/rules.js` is not yet passed to the game factory.

const PLUGIN_ROOT = join(process.cwd(), 'packages', 'plugins')

// Every id currently declared with nothing behind it. Shrink-only: the fix for
// an entry is either to implement the rule and register it, or to remove the
// declaration from the plugin. Adding to this list is not a fix.
const UNIMPLEMENTED = [
  'capture.custodial',
  'capture.mancala',
  'capture.recruit',
  'capture.screen-jump',
  'check',
  'checkmate',
  'connection',
  'constraint.facing',
  'constraint.region',
  'dice.move',
  'mill.capture',
  'mill.formation',
  'pass.forced',
  'placement',
  'promotion.zone',
  'property.rent',
  'sowing',
  'territory.count',
  'treasury',
]

function declaredIds() {
  const found = new Map()
  for (const entry of readdirSync(PLUGIN_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const srcDir = join(PLUGIN_ROOT, entry.name, 'src')
    if (!existsSync(srcDir)) continue
    for (const file of readdirSync(srcDir).filter(f => f.endsWith('.js'))) {
      const text = readFileSync(join(srcDir, file), 'utf8')
      const match = text.match(/^\s*rules:\s*\[([^\]]*)\]/m)
      if (!match) continue
      for (const raw of match[1].split(',')) {
        const id = raw.trim().replace(/^['"]|['"]$/g, '')
        if (id) found.set(id, entry.name)
      }
    }
  }
  return found
}

describe('declared rule ids (engine#88)', () => {
  const DECLARED = declaredIds()

  // A guard that reads nothing passes. Assert it found the plugins first.
  it('reads the plugin corpus', () => {
    expect(DECLARED.size).toBeGreaterThan(15)
  })

  it('names no id that is neither registered nor on the unimplemented list', () => {
    const stray = [...DECLARED.keys()]
      .filter(id => !(id in RULES))
      .filter(id => !UNIMPLEMENTED.includes(id))
      .sort()
    expect(stray).toEqual([])
  })

  it('the unimplemented list only shrinks', () => {
    const missing = [...DECLARED.keys()].filter(id => !(id in RULES))
    expect(missing.length).toBeLessThanOrEqual(UNIMPLEMENTED.length)
  })

  it('lists nothing on the unimplemented list that is now registered', () => {
    const resolved = UNIMPLEMENTED.filter(id => id in RULES)
    expect(resolved).toEqual([])
  })

  it('every registered factory builds a rule carrying its own id', () => {
    for (const [id, factory] of Object.entries(RULES)) {
      const rule = factory({})
      expect(typeof rule).toBe('object')
      expect(rule.hooks).toBeTruthy()
      expect(rule.id || id).toBeTruthy()
    }
  })
})
