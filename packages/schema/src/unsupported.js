// Which variants a family says the engine cannot actually play, and why.
//
// Three rulebooks carry an `unsupported` block naming 34 variants between
// them, each with the mechanic it would need. It is good information, written
// with care, and until now it was read by nothing: it cascaded into plugin
// config, produced 20 of the entries in the engine#139 unclaimed-key ratchet,
// and had no effect on anything.
//
// That matters because those variants load, generate legal moves and reach
// terminal positions while ignoring the mechanic that defines them, so nothing
// distinguishes them from variants that genuinely work. engine#141 nearly read
// twenty-five of them as free wins.
//
// Two shapes are accepted, because both are already in the corpus:
//
//   rulebook.md    unsupported:
//                    hasami-shogi: "custodial capture, no drops, no promotion"
//
//   variant.md     unsupported: "the skip-one relay capture is not modelled"
//
// and on a rulebook the block sits at either the top level or inside `engine`,
// because the three that exist do not agree with each other.

function blockFrom(meta) {
  if (!meta || typeof meta !== 'object') return null
  if (meta.unsupported !== undefined) return meta.unsupported
  if (meta.engine && meta.engine.unsupported !== undefined) return meta.engine.unsupported
  return null
}

// A rulebook may carry a `_family` entry: the part of the reason that is true
// of every variant it names, stated once instead of copied into each. Tafl's
// four variants are all blocked on the same missing plugin and differ only in
// board size, so without this the same paragraph appears four times and the one
// sentence that distinguishes them is buried at the end of it.
//
// It is not a slug and never surfaces as one. Variant slugs are kebab-case, so
// the leading underscore cannot collide with a real variant.
const FAMILY_KEY = '_family'

function joinReason(shared, own) {
  if (!shared) return own
  if (!own) return shared
  return `${shared} ${own}`
}

// A rulebook's declarations, as a Map of slug -> reason.
export function unsupportedVariants(rulebookMeta) {
  const block = blockFrom(rulebookMeta)
  const out = new Map()
  if (!block || typeof block !== 'object' || Array.isArray(block)) return out
  const shared = typeof block[FAMILY_KEY] === 'string' ? block[FAMILY_KEY].trim() : ''
  for (const [slug, reason] of Object.entries(block)) {
    if (slug === FAMILY_KEY) continue
    if (typeof reason === 'string' && reason.trim()) out.set(slug, joinReason(shared, reason.trim()))
    else if (reason === null && shared) out.set(slug, shared)
  }
  return out
}

// A single variant's own declaration, or null.
export function unsupportedReason(variantMeta) {
  const block = blockFrom(variantMeta)
  return typeof block === 'string' && block.trim() ? block.trim() : null
}

// Everything a family declares, from its rulebook and from each variant.
export function unsupportedForFamily(rulebookMeta, variantMetas = {}) {
  const out = new Map(unsupportedVariants(rulebookMeta))
  for (const [slug, meta] of Object.entries(variantMetas)) {
    const reason = unsupportedReason(meta)
    if (reason) out.set(slug, reason)
  }
  return out
}
