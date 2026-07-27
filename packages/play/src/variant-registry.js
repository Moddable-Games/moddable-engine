const registries = new Map()

function registryFor(family) {
  if (!registries.has(family)) registries.set(family, new Map())
  return registries.get(family)
}

export function registerVariant(family, key, config) {
  if (!family) throw new Error('registerVariant requires a family')
  if (!key) throw new Error('registerVariant requires a key')
  registryFor(family).set(key, { key, ...config })
}

export function registerVariants(family, variants) {
  const entries = Array.isArray(variants) ? variants : Object.values(variants)
  for (const variant of entries) {
    if (!variant || !variant.key) continue
    registerVariant(family, variant.key, variant)
  }
}

export function getVariantConfig(family, key) {
  return resolve(registryFor(family), key)
}

export function getVariantKeys(family) {
  return [...registryFor(family).keys()]
}

export function hasVariant(family, key) {
  return registryFor(family).has(key)
}

export function getRegisteredFamilies() {
  return [...registries.keys()]
}

export function listVariants(family, group) {
  const registry = registryFor(family)
  const results = []
  for (const key of registry.keys()) {
    const config = resolve(registry, key)
    if (!config || config.hidden) continue
    if (group && config.group !== group) continue
    results.push({
      key,
      label: config.label || config.title || key,
      group: config.group || 'Other',
      board: describeBoard(config),
      description: config.description || '',
      rule: config.rule || '',
      players: config.players || 2,
    })
  }
  return results
}

export function getVariantGroups(family) {
  const groups = new Map()
  for (const variant of listVariants(family)) {
    if (!groups.has(variant.group)) groups.set(variant.group, [])
    groups.get(variant.group).push(variant)
  }
  return groups
}

export function clearVariants(family) {
  if (family) registries.delete(family)
  else registries.clear()
}

function describeBoard(config) {
  if (config.board) return config.board
  if (config.size) return config.size + '×' + config.size
  if (config.rows && config.cols) return config.rows + '×' + config.cols
  return ''
}

function resolve(registry, key, seen = new Set()) {
  const raw = registry.get(key)
  if (!raw) return null
  if (!raw.extends) return raw
  if (seen.has(key)) {
    throw new Error(`Circular variant inheritance detected at "${key}"`)
  }
  seen.add(key)

  const parents = Array.isArray(raw.extends) ? raw.extends : [raw.extends]
  let merged = {}
  for (const parentKey of parents) {
    const parent = resolve(registry, parentKey, seen)
    if (parent) merged = mergeConfig(merged, parent)
  }
  return mergeConfig(merged, raw)
}

function mergeConfig(base, overlay) {
  const result = { ...base, ...overlay }
  if (base.hooks || overlay.hooks) {
    result.hooks = { ...base.hooks, ...overlay.hooks }
  }
  if (base.pieces || overlay.pieces) {
    result.pieces = { ...base.pieces, ...overlay.pieces }
  }
  if (base.vocabulary || overlay.vocabulary) {
    result.vocabulary = { ...base.vocabulary, ...overlay.vocabulary }
  }
  delete result.extends
  return result
}
