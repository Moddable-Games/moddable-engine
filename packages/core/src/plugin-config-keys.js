// Shared vocabulary for the "unknown config key" guard every plugin runs.
//
// The guard exists to catch a mistyped or unconsumed frontmatter key. Before
// this module each plugin filtered against its own `defaults` object plus a
// hand-maintained chain of `k !== '...'` tests. That produced a warning on all
// 176 playable variants, because `defaults` is the set of keys that happen to
// carry a default value rather than the set the plugin consumes, and because
// most of the volume came from platform keys that are not plugin config at all.
// A guard that fires on everything is a guard nobody reads, which is how
// four-player-shogi shipped with three of four armies advancing the wrong way
// and how an inline YAML comment silently turned `advancement` into a string.

// Keys that reach a plugin's variant config because `resolveMeta` folds every
// non-structural frontmatter key into it, but which are consumed by the
// platform - the site layer, the cascade, the renderer, or the search - rather
// than by any plugin. Listing them here rather than filtering them out in
// `resolveMeta` leaves runtime behaviour untouched: a plugin that does read one
// of these still receives it, it simply stops being reported as a mystery.
export const PLATFORM_KEYS = new Set([
  'defaultSeat',
  // authored documentation of which rules a playable variant simplifies, the
  // sibling of `unsupported` for variants that do ship. Content, not config.
  'approximations',
  // read by packages/schema/src/unsupported.js, not by any plugin
  'unsupported',
  // read by the search and AI layer when picking an evaluator
  'evaluate',
  'handicaps',
  'interactionModel',
  'notation',
  'openingBook',
  'parent',
  'pieceRotations',
  'published',
  'render',
  'search',
  'slug',
  'title',
  'topology',
  'uniformPieces',
])

// Keys every plugin accepts structurally, whether or not it names them.
export const COMMON_PLUGIN_KEYS = new Set([
  'extends',
  'hooks',
  'pieces',
  'vocabulary',
])

// The keys in `variantConfig` that no one has claimed. A non-empty result is
// either a typo or a rule declared in content that the engine silently ignores.
export function unknownConfigKeys(variantConfig, knownKeys) {
  const known = knownKeys instanceof Set ? knownKeys : new Set(knownKeys || [])
  return Object.keys(variantConfig || {}).filter(k =>
    !known.has(k) && !COMMON_PLUGIN_KEYS.has(k) && !PLATFORM_KEYS.has(k))
}

export function warnUnknownConfigKeys(family, variantConfig, knownKeys) {
  const unknown = unknownConfigKeys(variantConfig, knownKeys)
  if (unknown.length > 0) {
    console.warn(`[${family}] Unknown config keys: ${unknown.join(', ')}. Check spelling.`)
  }
  return unknown
}
