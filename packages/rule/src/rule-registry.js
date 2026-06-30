export function createRuleRegistry() {
  const factories = new Map()

  function register(id, factory) {
    if (typeof factory !== 'function') {
      throw new Error(`Rule "${id}" must be registered with a factory function`)
    }
    factories.set(id, factory)
  }

  function create(id, config = {}) {
    const factory = factories.get(id)
    if (!factory) {
      throw new Error(`No rule registered for id "${id}"`)
    }
    const rule = factory(config)
    if (!rule.id) rule.id = id
    return rule
  }

  function has(id) {
    return factories.has(id)
  }

  function getAll() {
    return [...factories.keys()]
  }

  return { register, create, has, getAll }
}
