const registry = {}

export function registerDeck(key, config) {
  registry[key] = config
}

export function getDeckConfig(key) {
  return registry[key] || null
}

export function getRegisteredDecks() {
  return Object.keys(registry)
}

export function getAllDecks() {
  return registry
}
