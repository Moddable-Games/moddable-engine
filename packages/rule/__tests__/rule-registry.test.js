import { createRuleRegistry } from '../index.js'

describe('rule-registry', () => {
  let registry

  beforeEach(() => {
    registry = createRuleRegistry()
  })

  it('registers and creates a rule', () => {
    registry.register('test-rule', (config) => ({
      id: 'test-rule',
      hooks: { init: () => ({ value: config.x || 1 }) },
    }))
    const rule = registry.create('test-rule', { x: 42 })
    expect(rule.id).toBe('test-rule')
    expect(rule.hooks.init()).toEqual({ value: 42 })
  })

  it('throws on duplicate-safe overwrite', () => {
    registry.register('r1', () => ({ id: 'r1' }))
    registry.register('r1', () => ({ id: 'r1-v2' }))
    const rule = registry.create('r1')
    expect(rule.id).toBe('r1-v2')
  })

  it('throws on create for unregistered rule', () => {
    expect(() => registry.create('nonexistent')).toThrow(/No rule registered/)
  })

  it('throws if factory is not a function', () => {
    expect(() => registry.register('bad', {})).toThrow(/factory function/)
  })

  it('has() checks existence', () => {
    expect(registry.has('x')).toBe(false)
    registry.register('x', () => ({ id: 'x' }))
    expect(registry.has('x')).toBe(true)
  })

  it('getAll() returns registered IDs', () => {
    registry.register('a', () => ({ id: 'a' }))
    registry.register('b', () => ({ id: 'b' }))
    expect(registry.getAll()).toEqual(['a', 'b'])
  })

  it('passes config to factory', () => {
    registry.register('configurable', (config) => ({
      id: 'configurable',
      value: config.setting,
    }))
    const rule = registry.create('configurable', { setting: 'on' })
    expect(rule.value).toBe('on')
  })

  it('assigns id from registry key if rule does not declare one', () => {
    registry.register('auto-id', () => ({ hooks: {} }))
    const rule = registry.create('auto-id')
    expect(rule.id).toBe('auto-id')
  })
})
