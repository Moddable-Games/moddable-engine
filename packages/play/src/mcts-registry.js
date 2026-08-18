const mctsDefaults = new Map()

export function registerMctsDefault(family) {
  mctsDefaults.set(family, true)
}

export function usesMctsDefault(family) {
  return mctsDefaults.get(family) === true
}
