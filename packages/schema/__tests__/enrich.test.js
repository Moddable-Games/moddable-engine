import { enrichMeta, serializeFrontmatter, enrichDryRun } from '../src/enrich.js'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { validate } from '../src/validate.js'
import { join } from 'node:path'
import { schema as gridSchema } from '../../topology-grid/src/topology-grid.js'
import { schema as hexSchema } from '../../topology-hex/src/topology-hex.js'
import { schema as trackSchema } from '../../topology-track/src/topology-track.js'
import { schema as pitSchema } from '../../topology-pit/src/topology-pit.js'
import { schema as graphSchema } from '../../topology-graph/src/topology-graph.js'

const ALL_TOPOLOGIES = [gridSchema, hexSchema, trackSchema, pitSchema, graphSchema]
const RULES_DIR = '/Applications/MAMP/htdocs/MODDABLE/moddable-rules/games'

describe('enrichMeta', () => {
  test('adds engine block to existing meta', () => {
    const meta = { title: 'Standard Chess', slug: 'standard', parent: 'moddable-chess', players: '2' }
    const engine = { topology: { type: 'grid', rows: 8, cols: 8 }, players: ['white', 'black'] }
    const result = enrichMeta(meta, engine)
    expect(result.engine).toEqual(engine)
    expect(result.title).toBe('Standard Chess')
  })
})

describe('serializeFrontmatter', () => {
  test('serializes simple meta to valid YAML frontmatter', () => {
    const meta = { title: 'Test', slug: 'test', parent: 'chess', players: '2' }
    const output = serializeFrontmatter(meta)
    expect(output.startsWith('---')).toBe(true)
    expect(output.endsWith('---')).toBe(true)
    expect(output).toContain('title: Test')
    expect(output).toContain('slug: test')
  })

  test('serializes nested engine block', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
      },
    }
    const output = serializeFrontmatter(meta)
    expect(output).toContain('engine:')
    expect(output).toContain('  topology:')
    expect(output).toContain('    type: grid')
    expect(output).toContain('    rows: 8')
    expect(output).toContain('  players: [white, black]')
  })

  test('round-trips through parser', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      board: '8×8',
      win: 'Checkmate',
      special: 'Standard FIDE rules',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
      },
    }
    const serialized = serializeFrontmatter(meta)
    const parsed = parseFrontmatter(serialized + '\n')
    expect(parsed.meta.title).toBe('Standard Chess')
    expect(parsed.meta.engine.topology.type).toBe('grid')
    expect(parsed.meta.engine.topology.rows).toBe(8)
    expect(parsed.meta.engine.players).toEqual(['white', 'black'])
  })

  test('round-trip produces valid engine definition', () => {
    const meta = {
      title: 'Oware',
      slug: 'oware',
      parent: 'mancala',
      players: '2',
      board: '2×6 pits',
      win: 'Most seeds',
      special: 'Grand slam',
      engine: {
        topology: { type: 'pit', pitsPerSide: 6 },
        players: ['south', 'north'],
      },
    }
    const serialized = serializeFrontmatter(meta)
    const parsed = parseFrontmatter(serialized + '\n')
    const validation = validate(parsed.meta, ALL_TOPOLOGIES)
    expect(validation.valid).toBe(true)
  })

  test('serializes quoted strings with special chars', () => {
    const meta = { title: 'Chess: The Game', slug: 'chess' }
    const output = serializeFrontmatter(meta)
    expect(output).toContain('"Chess: The Game"')
  })

  test('serializes boolean values', () => {
    const meta = { published: true, draft: false }
    const output = serializeFrontmatter(meta)
    expect(output).toContain('published: true')
    expect(output).toContain('draft: false')
  })

  test('serializes integer values', () => {
    const meta = { order: 3 }
    const output = serializeFrontmatter(meta)
    expect(output).toContain('order: 3')
  })
})

describe('enrichDryRun against real files', () => {
  const enrichOpts = { topologySchemas: ALL_TOPOLOGIES }

  test('chess variant can be enriched', async () => {
    const path = join(RULES_DIR, 'moddable-chess', 'content', 'variants', 'standard.md')
    const result = await enrichDryRun(path, enrichOpts)
    expect(result.wouldChange).toBe(true)
    expect(result.preview).toContain('engine:')
    expect(result.preview).toContain('type: grid')
    expect(result.preview).toContain('rows: 8')
    expect(result.preview).toContain('cols: 8')
  })

  test('mancala variant can be enriched', async () => {
    const path = join(RULES_DIR, 'mancala', 'content', 'variants', 'oware.md')
    const result = await enrichDryRun(path, enrichOpts)
    expect(result.wouldChange).toBe(true)
    expect(result.preview).toContain('type: pit')
    expect(result.preview).toContain('pitsPerSide: 6')
  })

  test('backgammon variant can be enriched', async () => {
    const path = join(RULES_DIR, 'backgammon', 'content', 'variants', 'standard.md')
    const result = await enrichDryRun(path, enrichOpts)
    expect(result.wouldChange).toBe(true)
    expect(result.preview).toContain('type: track')
    expect(result.preview).toContain('positions: 24')
  })

  test('go variant can be enriched', async () => {
    const path = join(RULES_DIR, 'go', 'content', 'variants', 'standard.md')
    const result = await enrichDryRun(path, enrichOpts)
    expect(result.wouldChange).toBe(true)
    expect(result.preview).toContain('type: grid')
    expect(result.preview).toContain('rows: 19')
    expect(result.preview).toContain('cols: 19')
  })

  test('enriched preview round-trips to valid definition', async () => {
    const path = join(RULES_DIR, 'moddable-chess', 'content', 'variants', 'standard.md')
    const result = await enrichDryRun(path, enrichOpts)
    const parsed = parseFrontmatter(result.preview + '\n')
    const validation = validate(parsed.meta, ALL_TOPOLOGIES)
    expect(validation.valid).toBe(true)
  })
})
