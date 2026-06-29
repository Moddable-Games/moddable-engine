import { validate } from '../src/validate.js'

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
    const result = validate(validMeta)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('rejects missing required fields', () => {
    const result = validate({ engine: { topology: { type: 'grid', rows: 8, cols: 8 } } })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'title')).toBe(true)
    expect(result.errors.some(e => e.field === 'slug')).toBe(true)
    expect(result.errors.some(e => e.field === 'parent')).toBe(true)
  })

  test('rejects missing engine block', () => {
    const result = validate({ title: 'X', slug: 'x', parent: 'y', players: '2' })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.field === 'engine')).toBe(true)
  })

  test('rejects unknown topology type', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'sphere' } } }
    const result = validate(meta)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('unknown topology type'))).toBe(true)
  })

  test('rejects grid without rows/cols', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'grid' } } }
    const result = validate(meta)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('"rows"'))).toBe(true)
    expect(result.errors.some(e => e.message.includes('"cols"'))).toBe(true)
  })

  test('accepts valid hex game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'hex', radius: 5 } } }
    const result = validate(meta)
    expect(result.valid).toBe(true)
  })

  test('rejects hex without radius', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'hex' } } }
    const result = validate(meta)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('"radius"'))).toBe(true)
  })

  test('accepts valid track game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'track', positions: 24 } } }
    const result = validate(meta)
    expect(result.valid).toBe(true)
  })

  test('accepts valid pit game', () => {
    const meta = { ...validMeta, engine: { topology: { type: 'pit', pitsPerSide: 6 } } }
    const result = validate(meta)
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
    const result = validate(meta)
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
    const result = validate(meta)
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
    const result = validate(meta)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.message.includes('piece must have a movement'))).toBe(true)
  })
})
