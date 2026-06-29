export function createTopologyRegistry() {
  const factories = new Map()

  function register(type, factory) {
    factories.set(type, factory)
  }

  function create(config) {
    if (!config || !config.type) return null
    const factory = factories.get(config.type)
    if (!factory) {
      throw new Error(`No topology factory registered for type "${config.type}"`)
    }
    return factory(config)
  }

  function has(type) {
    return factories.has(type)
  }

  function getTypes() {
    return [...factories.keys()]
  }

  return { register, create, has, getTypes }
}
