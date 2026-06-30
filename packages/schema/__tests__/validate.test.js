import { validate } from '../src/validate.js'
import { schema as gridSchema } from '../../topology-grid/src/topology-grid.js'
import { schema as hexSchema } from '../../topology-hex/src/topology-hex.js'
import { schema as trackSchema } from '../../topology-track/src/topology-track.js'
import { schema as pitSchema } from '../../topology-pit/src/topology-pit.js'
import { schema as graphSchema } from '../../topology-graph/src/topology-graph.js'

const ALL_TOPOLOGIES = [gridSchema, hexSchema, trackSchema, pitSchema, graphSchema]

describe('validate', () => {
  const validMeta = {
    title: 'Standard Chess',
    slug: 'standard',
    parent: 'moddable-chess',
    players: '2',
    engine: {
      topology: { type: 'grid', rows: 8, cols: 8 },
    },
  }

  test('accepts valid grid game', () => {
    const result = validate(validMeta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('rejects missing required fields', () => {
    const result = validate({ engine: { topology: { type: 'grid', rows: 8, cols: 8 } } }, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'title')).toBe(true)
    expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    expect(result.errors.some(e => e.field === 'parent')).toBe(true)
  })

  test('rejects missing engine block', () => {
    const result = validate({ title: 'X', slug: 'x', parent: 'y', players: '2' }, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'engine')).toBe(true)
  })

  test('rejects unknown topology type', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'sphere' } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('unknown topology type'))).toBe(true)
  })

  test('rejects grid without rows/cols', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'grid' } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('"rows"'))).toBe(true)
    expect(result.errors.some(e => e.message.includes('"cols"'))).toBe(true)
  })

  test('accepts valid hex game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'hex', radius: 5 } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(true)
  })

  test('rejects hex without radius or size', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'hex' } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('hex'))).toBe(true)
  })

  test('accepts valid track game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'track', positions: 24 } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(true)
  })

  test('accepts valid pit game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'pit', pitsPerSide: 6 } } }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(true)
  })

  test('validates piece definitions', () => {
    const meta = {
      ...validMeta,
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        pieces: [{ name: 'knight', movement: { type: 'leap', offsets: [[2, 1]] } }],
      },
    }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(true)
  })

  test('rejects piece without name', () => {
    const meta = {
      ...validMeta,
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        pieces: [{ movement: { type: 'leap' } }],
      },
    }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('piece must have a name'))).toBe(true)
  })

  test('rejects piece without movement', () => {
    const meta = {
      ...validMeta,
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        pieces: [{ name: 'knight' }],
      },
    }
    const result = validate(meta, ALL_TOPOLOGIES)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('piece must have a movement'))).toBe(true)
  })
})
