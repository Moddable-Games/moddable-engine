const plugins = new Map()

export function register(id, entry) {
  if (!id) throw new Error('Plugin id is required')
  if (!entry || typeof entry.factory !== 'function') {
    throw new Error(`Plugin "${id}" must have a factory function`)
  }
  plugins.set(id, entry)
}

export function get(id) {
  return plugins.get(id) || null
}

export function has(id) {
  return plugins.has(id)
}

export function getAll() {
  return [...plugins.entries()].map(([id, entry]) => ({ id, ...entry }))
}

export function getIds() {
  return [...plugins.keys()]
}

export function createFactory(id) {
  const entry = plugins.get(id)
  if (!entry) throw new Error(`Unknown plugin: "${id}"`)
  return entry.factory
}

export function clear() {
  plugins.clear()
}
