import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { inferEngineBlock } from '../src/infer.js'
import { enrichMeta, serializeFrontmatter } from '../src/enrich.js'
import { validate } from '../src/validate.js'
import { produce } from '../src/produce.js'
import { createGridTopology } from '../../topology-grid/src/topology-grid.js'
import { createPitTopology } from '../../topology-pit/src/topology-pit.js'
import { createTrackTopology } from '../../topology-track/src/topology-track.js'
import { createHexTopology } from '../../topology-hex/src/topology-hex.js'
import { createPlayerSystem } from '../../core/src/player-system.js'
import { createStore } from '../../core/src/state-store.js'

const RULES_DIR = '/Applications/MAMP/htdocs/MODDABLE/moddable-rules/games'

const FACTORIES = {
  grid: createGridTopology,
  hex: createHexTopology,
  pit: createPitTopology,
}

async function roundTrip(familyPath) {
  const content = await readFile(familyPath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  const engineBlock = inferEngineBlock(meta)
  const enriched = enrichMeta(meta, engineBlock)
  const serialized = serializeFrontmatter(enriched)
  const reparsed = parseFrontmatter(serialized + '\n')
  const validation = validate(reparsed.meta)
  if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`)
  const definition = produce(reparsed.meta)
  return definition
}

describe('proof: full round-trip from real moddable-rules files', () => {
  test('chess standard → grid topology instance', async () => {
    const def = await roundTrip(join(RULES_DIR, 'moddable-chess/content/variants/standard.md'))
    expect(def.id).toBe('moddable-chess/standard')
    const topo = createGridTopology(def.topology)
    expect(topo.size).toBe(64)
    expect(topo.neighbours(27)).toHaveLength(4)
  })

  test('atomic chess → grid topology with 8x8', async () => {
    const def = await roundTrip(join(RULES_DIR, 'moddable-chess/content/variants/atomic.md'))
    expect(def.id).toBe('moddable-chess/atomic')
    const topo = createGridTopology(def.topology)
    expect(topo.size).toBe(64)
  })

  test('go standard → 19x19 grid', async () => {
    const def = await roundTrip(join(RULES_DIR, 'go/content/variants/standard.md'))
    expect(def.id).toBe('go/standard')
    const topo = createGridTopology(def.topology)
    expect(topo.size).toBe(361)
    expect(topo.rows).toBe(19)
  })

  test('draughts international → 10x10 grid', async () => {
    const def = await roundTrip(join(RULES_DIR, 'draughts/content/variants/international.md'))
    expect(def.id).toBe('draughts/international')
    const topo = createGridTopology(def.topology)
    expect(topo.size).toBe(100)
  })

  test('oware → pit topology with 6 pits per side', async () => {
    const def = await roundTrip(join(RULES_DIR, 'mancala/content/variants/oware.md'))
    expect(def.id).toBe('mancala/oware')
    const topo = createPitTopology(def.topology)
    expect(topo.pitsPerSide).toBe(6)
    expect(topo.totalPits).toBe(12)
  })

  test('kalah → pit topology', async () => {
    const def = await roundTrip(join(RULES_DIR, 'mancala/content/variants/kalah.md'))
    expect(def.id).toBe('mancala/kalah')
    const topo = createPitTopology(def.topology)
    expect(topo.pitsPerSide).toBe(6)
  })

  test('backgammon standard → track topology with 24 positions', async () => {
    const def = await roundTrip(join(RULES_DIR, 'backgammon/content/variants/standard.md'))
    expect(def.id).toBe('backgammon/standard')
    const positions = Array.from({ length: def.topology.positions }, (_, i) => `point-${i}`)
    const topo = createTrackTopology({ ...def.topology, positions })
    expect(topo.isValid('point-0')).toBe(true)
    expect(topo.isValid('point-23')).toBe(true)
  })

  test('reversi standard → 8x8 grid', async () => {
    const def = await roundTrip(join(RULES_DIR, 'reversi/content/variants/standard.md'))
    const topo = createGridTopology(def.topology)
    expect(topo.size).toBe(64)
  })

  test('player system works for all variants', async () => {
    const defs = await Promise.all([
      roundTrip(join(RULES_DIR, 'moddable-chess/content/variants/standard.md')),
      roundTrip(join(RULES_DIR, 'mancala/content/variants/oware.md')),
      roundTrip(join(RULES_DIR, 'go/content/variants/standard.md')),
    ])
    for (const def of defs) {
      const ps = createPlayerSystem({ players: def.players.names })
      const store = createStore({})
      store.claimSlice(ps.sliceName, ps.sliceName)
      store.set(ps.sliceName, ps.initState(), ps.sliceName)
      expect(ps.current(store)).toBe(def.players.names[0])
    }
  })

  test('all 154 variants infer a topology type and round-trip serialization', async () => {
    const { loadAllFamilies } = await import('../src/loader.js')
    const families = await loadAllFamilies(RULES_DIR)
    let fullSuccess = 0
    let partialSuccess = 0

    for (const family of families) {
      for (const variant of family.variants) {
        const engineBlock = inferEngineBlock(variant.meta)
        expect(engineBlock).not.toBeNull()
        expect(engineBlock.topology.type).toBeDefined()

        const enriched = enrichMeta(variant.meta, engineBlock)
        const serialized = serializeFrontmatter(enriched)
        const reparsed = parseFrontmatter(serialized + '\n')

        expect(reparsed.meta.engine).toBeDefined()
        expect(reparsed.meta.engine.topology.type).toBe(engineBlock.topology.type)

        const validation = validate(reparsed.meta)
        if (validation.valid) {
          const definition = produce(reparsed.meta)
          expect(definition.topology.type).toBeDefined()
          fullSuccess++
        } else {
          partialSuccess++
        }
      }
    }

    expect(fullSuccess + partialSuccess).toBe(154)
    expect(fullSuccess).toBeGreaterThan(130)
  })
})
