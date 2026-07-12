/**
 * Cascade Resolver — steps 4-6 of the render pipeline.
 *
 * Deep-merges: resolved surface → family engine: → variant engine:
 * Derives defaults for missing fields.
 * Validates minimum requirements.
 *
 * Pure function: plain objects in, plain object out. No side effects.
 */

// --- Deep merge utility ---

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override !== undefined ? override : base
  }
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (isPlainObject(base[key]) && isPlainObject(override[key])) {
      result[key] = deepMerge(base[key], override[key])
    } else if (override[key] !== undefined) {
      result[key] = override[key]
    }
  }
  return result
}

// --- Default derivation ---

const CELL_COLOR_DEFAULTS = {
  grid: 'checkered',
  hex: 'uniform',
  track: 'none',
  pit: 'none',
  graph: 'uniform',
  none: 'none',
}

const LABEL_DEFAULTS = {
  grid: true,
  hex: false,
  track: false,
  pit: false,
  graph: false,
  none: false,
}

function deriveCategory(topology, components) {
  if (!topology || topology.type === 'none') {
    if (components?.deck) return 'card'
    if (components?.dice) return 'dice'
    if (components?.tiles) return 'tile'
    return 'rpg'
  }
  return 'board'
}

function deriveDefaults(resolved) {
  const topo = resolved.topology || {}
  const render = resolved.render || {}
  const meta = resolved.meta || {}
  const components = resolved.components || {}

  if (render.cellColor === undefined && topo.type) {
    render.cellColor = CELL_COLOR_DEFAULTS[topo.type] || 'none'
  }

  if (render.frame === undefined && topo.shape) {
    render.frame = topo.shape
  }

  if (render.labels === undefined && topo.type) {
    render.labels = LABEL_DEFAULTS[topo.type] || false
  }

  if (meta.category === undefined) {
    meta.category = deriveCategory(topo, components)
  }

  resolved.render = render
  resolved.meta = meta
  return resolved
}

// --- Validation ---

function validate(resolved) {
  const errors = []
  const topo = resolved.topology || {}
  const components = resolved.components || {}
  const meta = resolved.meta || {}

  if (meta.category === 'board') {
    if (!topo.type) {
      errors.push('Board games require topology.type')
    }
  }

  if (meta.category === 'card' || meta.category === 'dice' || meta.category === 'tile') {
    if (!components.deck && !components.dice && !components.tiles) {
      errors.push('Component games require components.deck, components.dice, or components.tiles')
    }
  }

  if (!meta.label) {
    errors.push('meta.label must resolve (explicit or derived)')
  }

  return errors
}

// --- Main resolver ---

export function resolve({ surface, family, variant }) {
  // Surface provides colour baseline for the engine.surface field
  const surfaceBase = surface || {}

  // Family engine: block (defaults for all variants)
  const familyEngine = family?.engine || {}
  const familyMeta = family?.meta || {}

  // Variant engine: block (overrides)
  const variantEngine = variant?.engine || {}
  const variantMeta = variant?.meta || {}

  // Step 4: Deep merge engine blocks
  // Surface colours merge into the surface slot of the resolved object
  // Family and variant can override surface colours via their own surface: field
  const familySurface = familyEngine.surface || {}
  const variantSurface = variantEngine.surface || {}

  const resolvedSurface = deepMerge(
    deepMerge(surfaceBase, isPlainObject(familySurface) ? familySurface : {}),
    isPlainObject(variantSurface) ? variantSurface : {}
  )

  // Merge all engine fields except surface (handled above)
  const { surface: _fs, ...familyRest } = familyEngine
  const { surface: _vs, ...variantRest } = variantEngine
  const mergedEngine = deepMerge(familyRest, variantRest)

  // Merge meta blocks (tags concatenate)
  const familyTags = familyMeta.tags || []
  const variantTags = variantMeta.tags || []
  const { tags: _ft, ...familyMetaRest } = familyMeta
  const { tags: _vt, ...variantMetaRest } = variantMeta
  const mergedMeta = deepMerge(familyMetaRest, variantMetaRest)
  mergedMeta.tags = [...familyTags, ...variantTags]

  // Assemble resolved definition
  let resolved = {
    ...mergedEngine,
    surface: resolvedSurface,
    meta: mergedMeta,
  }

  // Step 5: Derive defaults
  resolved = deriveDefaults(resolved)

  // Step 6: Validate
  const errors = validate(resolved)

  return { resolved, errors }
}

// --- Utility exports (for testing) ---
export { deepMerge, deriveDefaults, validate }
