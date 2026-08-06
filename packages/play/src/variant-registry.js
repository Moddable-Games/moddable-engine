import { parseFrontmatter } from '../../schema/src/parse-frontmatter.js'

const registries = new Map()
const manifests = new Map()

let _listSlugs = null
let _readFile = null

export function setVariantSources(listFn, readFn) {
  _listSlugs = listFn || null
  _readFile = readFn || null
  manifests.clear()
}

function registryFor(family) {
  if (!registries.has(family)) registries.set(family, new Map())
  return registries.get(family)
}

export function registerVariant(family, key, config) {
  if (!family) throw new Error('registerVariant requires a family')
  if (!key) throw new Error('registerVariant requires a key')
  registryFor(family).set(key, { key, ...config })
  manifests.delete(family)
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
  const manifest = getManifest(family)
  return [...manifest.playable, ...manifest.unplayable].map(e => e.key)
}

export function hasVariant(family, key) {
  if (registryFor(family).has(key)) return true
  const slugs = candidateKeys(family)
  if (slugs.includes(key)) return true
  for (const slug of slugs) {
    const meta = readMeta(family, slug)
    if (meta?.key === key) return true
  }
  return false
}

export function getRegisteredFamilies() {
  return [...registries.keys()]
}

export function getSlugForKey(family, key) {
  const manifest = getManifest(family)
  for (const entry of [...manifest.playable, ...manifest.unplayable]) {
    if (entry.key === key) return entry.slug
  }
  return key
}

export function listVariants(family, group) {
  const manifest = getManifest(family)
  const results = []
  for (const entry of manifest.playable) {
    if (entry.hidden) continue
    if (group && entry.group !== group) continue
    results.push(entry)
  }
  return results
}

export function getManifest(family) {
  if (manifests.has(family)) return manifests.get(family)
  const manifest = buildManifest(family)
  manifests.set(family, manifest)
  return manifest
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
  if (family) {
    registries.delete(family)
    manifests.delete(family)
  } else {
    registries.clear()
    manifests.clear()
  }
}

export function invalidateManifest(family) {
  if (family) manifests.delete(family)
  else manifests.clear()
}

function candidateKeys(family) {
  if (!_listSlugs) return []
  try { return _listSlugs(family) } catch { return [] }
}

function readMeta(family, slug) {
  if (!_readFile) return null
  try {
    const content = _readFile(family, slug)
    const { meta } = parseFrontmatter(content)
    return meta || null
  } catch {
    return null
  }
}

function buildManifest(family) {
  const registry = registryFor(family)
  const fileSlugs = candidateKeys(family)
  const playable = []
  const unplayable = []
  const seen = new Set()

  for (const slug of fileSlugs) {
    const meta = readMeta(family, slug)
    const canonicalKey = meta?.key || slug
    if (seen.has(canonicalKey)) continue
    seen.add(canonicalKey)

    const jsConfig = resolve(registry, canonicalKey)

    const isPlayable = jsConfig
      ? !jsConfig.hidden
      : (meta && meta.playable === true)

    const entry = {
      key: canonicalKey,
      slug,
      label: meta?.title || jsConfig?.label || jsConfig?.title || canonicalKey,
      group: jsConfig?.group || meta?.group || 'Other',
      board: describeBoard(jsConfig || meta?.engine || {}),
      description: meta?.special || jsConfig?.description || '',
      rule: jsConfig?.rule || '',
      players: jsConfig?.players || meta?.players || 2,
      hidden: jsConfig?.hidden || false,
      source: jsConfig ? (meta ? 'js+frontmatter' : 'js') : 'frontmatter',
    }

    if (isPlayable) {
      playable.push(entry)
    } else {
      unplayable.push(entry)
    }
  }

  for (const key of registry.keys()) {
    if (seen.has(key)) continue
    seen.add(key)
    const jsConfig = resolve(registry, key)
    if (!jsConfig) continue

    const entry = {
      key,
      label: jsConfig.label || jsConfig.title || key,
      group: jsConfig.group || 'Other',
      board: describeBoard(jsConfig),
      description: jsConfig.description || '',
      rule: jsConfig.rule || '',
      players: jsConfig.players || 2,
      hidden: jsConfig.hidden || false,
      source: 'js',
    }

    if (!jsConfig.hidden) {
      playable.push(entry)
    } else {
      unplayable.push(entry)
    }
  }

  return { playable, unplayable, total: seen.size }
}

function describeBoard(config) {
  if (config.board) return config.board
  if (config.size) return config.size + '×' + config.size
  if (config.rows && config.cols) return config.rows + '×' + config.cols
  const topo = config.topology
  if (topo && topo.rows && topo.cols) return topo.rows + '×' + topo.cols
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
