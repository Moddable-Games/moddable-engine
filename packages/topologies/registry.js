const topologies = new Map()

export function register(type, entry) {
  if (!type) throw new Error('Topology type is required')
  if (!entry || typeof entry.factory !== 'function') {
    throw new Error(`Topology "${type}" must have a factory function`)
  }
  topologies.set(type, entry)
}

export function get(type) {
  return topologies.get(type) || null
}

export function has(type) {
  return topologies.has(type)
}

export function create(config) {
  if (!config || !config.type) return null
  const entry = topologies.get(config.type)
  if (!entry) throw new Error(`No topology registered for type "${config.type}"`)
  return entry.factory(config)
}

export function getAll() {
  return [...topologies.entries()].map(([type, entry]) => ({ type, ...entry }))
}

export function getTypes() {
  return [...topologies.keys()]
}

export function clear() {
  topologies.clear()
}
