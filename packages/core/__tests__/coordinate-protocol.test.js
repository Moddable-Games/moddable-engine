import { CoordinateProtocol, assertImplements } from '../src/coordinate-protocol.js'

describe('coordinate-protocol', () => {
  const validTopology = {
    neighbours: () => [],
    isValid: () => true,
    toJSON: () => '0',
    fromJSON: () => 0,
    distance: () => 1,
  }

  test('assertImplements passes for complete topology', () => {
    expect(() => assertImplements(validTopology)).not.toThrow()
  })

  test('assertImplements throws for null', () => {
    expect(() => assertImplements(null)).toThrow('Topology must be an object')
  })

  test('assertImplements throws for missing methods', () => {
    expect(() => assertImplements({})).toThrow('neighbours')
  })

  test('assertImplements throws listing all missing methods', () => {
    const partial = { neighbours: () => [], isValid: () => true }
    expect(() => assertImplements(partial)).toThrow('toJSON')
    expect(() => assertImplements(partial)).toThrow('fromJSON')
    expect(() => assertImplements(partial)).toThrow('distance')
  })

  test('assertImplements throws for non-function properties', () => {
    const bad = { ...validTopology, neighbours: 'not a function' }
    expect(() => assertImplements(bad)).toThrow('neighbours')
  })

  test('CoordinateProtocol is frozen', () => {
    expect(Object.isFrozen(CoordinateProtocol)).toBe(true)
  })

  test('CoordinateProtocol has all method names', () => {
    expect(CoordinateProtocol.neighbours).toBe('neighbours')
    expect(CoordinateProtocol.isValid).toBe('isValid')
    expect(CoordinateProtocol.toJSON).toBe('toJSON')
    expect(CoordinateProtocol.fromJSON).toBe('fromJSON')
    expect(CoordinateProtocol.distance).toBe('distance')
  })
})
