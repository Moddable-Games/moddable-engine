export function createComponentRegistry() {
  const factories = new Map()

  function register(componentType, type, factory) {
    const key = `${componentType}.${type}`
    factories.set(key, factory)
  }

  function create(componentType, config) {
    if (!config || !config.type) return null
    const key = `${componentType}.${config.type}`
    const factory = factories.get(key)
    if (!factory) {
      throw new Error(`No component factory registered for ${componentType} type "${config.type}"`)
    }
    return factory(config)
  }

  function has(componentType, type) {
    return factories.has(`${componentType}.${type}`)
  }

  function getTypes(componentType) {
    const prefix = `${componentType}.`
    return [...factories.keys()]
      .filter(k => k.startsWith(prefix))
      .map(k => k.slice(prefix.length))
  }

  return { register, create, has, getTypes }
}
