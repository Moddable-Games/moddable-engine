// Plugins warn about a frontmatter key nothing reads. Topologies did not warn
// at all, which is how every mancala board came to declare `stores: false`
// against a topology that only ever read `hasStores` - four boards the rulebook
// calls storeless would silently have got stores (engine#140, trap 3).
//
// That one is fixed. This is the guard for the next one. It reads what each
// topology actually destructures or accesses, and compares it against what the
// corpus declares.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'
import { PLATFORM_KEYS } from '../../core/src/plugin-config-keys.js'

const ROOT = process.cwd()
const RULES_ROOT = process.env.MODDABLE_RULES_DIR
  || join(ROOT, '..', 'moddable-rules', 'games')

const SOURCES = {
  grid: 'packages/topologies/grid/src/topology-grid.js',
  hex: 'packages/topologies/hex/src/topology-hex.js',
  pit: 'packages/topologies/pit/src/topology-pit.js',
  track: 'packages/topologies/track/src/topology-track.js',
  graph: 'packages/topologies/graph/src/topology-graph.js',
  tableau: 'packages/topologies/tableau/src/topology-tableau.js',
}

// Read by the renderer and by produce-layout rather than by a topology, the
// same role PLATFORM_KEYS plays for plugins.
const RENDER_KEYS = new Set(['type', 'layout'])

function keysRead(file) {
  const source = readFileSync(join(ROOT, file), 'utf8')
  const found = new Set()
  for (const m of source.matchAll(/config\.([A-Za-z_][A-Za-z0-9_]*)/g)) found.add(m[1])
  // A destructure can contain nested braces (`branches = {}`), so scan to the
  // brace actually followed by `= config`, then split at depth zero.
  for (const m of source.matchAll(/const\s*\{([\s\S]*?)\}\s*=\s*config\b/g)) {
    let depth = 0, buf = ''
    const parts = []
    for (const ch of m[1]) {
      if (ch === '{' || ch === '[') depth++
      if (ch === '}' || ch === ']') depth--
      if (ch === ',' && depth === 0) { parts.push(buf); buf = '' } else buf += ch
    }
    parts.push(buf)
    for (const part of parts) {
      const name = part.split(':')[0].split('=')[0].trim()
      if (name) found.add(name)
    }
  }
  return found
}

const READS = Object.fromEntries(
  Object.entries(SOURCES).map(([type, file]) => [type, keysRead(file)])
)

function topologyBlocks() {
  const out = []
  let families = []
  try { families = readdirSync(RULES_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()) }
  catch { return out }
  for (const family of families) {
    const dir = join(RULES_ROOT, family.name, 'content', 'variants')
    let files = []
    try { files = readdirSync(dir).filter(f => f.endsWith('.md')) } catch { continue }
    for (const file of files) {
      const { meta } = parseFrontmatter(readFileSync(join(dir, file), 'utf8'))
      const topology = meta.engine?.topology
      if (!topology || typeof topology !== 'object') continue
      out.push({ where: `${family.name}/${file.replace('.md', '')}`, topology, playable: meta.playable === true })
    }
  }
  return out
}

const BLOCKS = topologyBlocks()

// Shrink-only, exactly like the plugin ratchet. Every entry here is a key on a
// variant that is not playable, describing structure the engine does not model
// yet - a 3D board, two boards side by side, a shape with no provider. None is
// a rule quietly failing to apply in a shipped game, and the count may only go
// down.
const UNREAD = {
  'grid|layers': 3,               // alice, gygax, raumschach - 3D boards
  'grid|layer_labels': 3,         // same three
  'grid|physical_representation': 1, // alice
  'grid|boards': 3,               // bughouse and tandem - two boards at once
  'grid|cells': 2,                // crazy-38s, flip-chess
  'grid|missing_squares': 2,      // same two
  'grid|loop': 1,                 // crazy-38s
  'hex|files': 1,                 // brusky - redundant beside its explicit grid
  'pit|rows': 1,                  // bao
}
const UNREAD_CEILING = Object.values(UNREAD).reduce((a, b) => a + b, 0)

// Boards whose topology type has no provider at all. Both are the
// hexagonal-trisection boards waiting on engine#26, plus sankaku-shogi's
// triangular board. None is playable.
const NO_PROVIDER = ['hexagonal-trisection', 'triangular']

describe('topology keys the engine reads', () => {
  it('found the corpus', () => {
    expect(BLOCKS.length).toBeGreaterThan(250)
  })

  it('every topology source yielded some keys', () => {
    for (const [type, keys] of Object.entries(READS)) {
      expect([type, keys.size > 0]).toEqual([type, true])
    }
  })

  // The one that matters. A playable variant declaring a topology key nothing
  // reads is a rule that does not apply in a game people can start.
  it('no playable variant declares a topology key nothing reads', () => {
    const unread = []
    for (const { where, topology, playable } of BLOCKS) {
      if (!playable) continue
      const known = READS[topology.type]
      if (!known) { unread.push(`${where}: no provider for topology "${topology.type}"`); continue }
      for (const key of Object.keys(topology)) {
        if (known.has(key) || RENDER_KEYS.has(key) || PLATFORM_KEYS.has(key)) continue
        if (UNREAD[`${topology.type}|${key}`]) continue
        unread.push(`${where}: ${topology.type}.${key}`)
      }
    }
    expect(unread).toEqual([])
  })

  it('introduces no new unread key anywhere in the corpus', () => {
    const novel = []
    for (const { topology } of BLOCKS) {
      const known = READS[topology.type]
      if (!known) continue
      for (const key of Object.keys(topology)) {
        if (known.has(key) || RENDER_KEYS.has(key) || PLATFORM_KEYS.has(key)) continue
        const id = `${topology.type}|${key}`
        if (!(id in UNREAD)) novel.push(id)
      }
    }
    expect([...new Set(novel)].sort()).toEqual([])
  })

  it('the unread ratchet only shrinks', () => {
    const counts = {}
    for (const { topology } of BLOCKS) {
      const known = READS[topology.type]
      if (!known) continue
      for (const key of Object.keys(topology)) {
        if (known.has(key) || RENDER_KEYS.has(key) || PLATFORM_KEYS.has(key)) continue
        const id = `${topology.type}|${key}`
        counts[id] = (counts[id] || 0) + 1
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(UNREAD_CEILING)
  })

  it('only the known boards name a topology with no provider', () => {
    const orphans = BLOCKS
      .filter(b => !READS[b.topology.type])
      .map(b => `${b.where} (${b.topology.type})${b.playable ? ' PLAYABLE' : ''}`)
      .sort()
    expect(orphans.every(o => NO_PROVIDER.some(t => o.includes(t)))).toBe(true)
    expect(orphans.filter(o => o.includes('PLAYABLE'))).toEqual([])
  })
})
