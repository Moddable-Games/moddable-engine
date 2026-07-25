const registry = new Map()

export function registerVariant(key, config) {
  registry.set(key, config)
}

export function getVariantConfig(key) {
  return resolveConfig(key)
}

export function getAllVariants() {
  return [...registry.keys()]
}

export function getVariantGroups() {
  const groups = new Map()
  for (const [key, config] of registry) {
    const group = config.group || 'Other'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push({ key, label: config.label || key, ...config })
  }
  return groups
}

function resolveConfig(key) {
  const raw = registry.get(key)
  if (!raw) return null
  if (!raw.extends) return raw
  const parents = Array.isArray(raw.extends) ? raw.extends : [raw.extends]
  let merged = {}
  for (const parentKey of parents) {
    const parent = resolveConfig(parentKey)
    if (parent) merged = { ...merged, ...parent }
  }
  return { ...merged, ...raw }
}
