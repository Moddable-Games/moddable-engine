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

// A rulebook's declarations, as a Map of slug -> reason.
export function unsupportedVariants(rulebookMeta) {
  const block = blockFrom(rulebookMeta)
  const out = new Map()
  if (!block || typeof block !== 'object' || Array.isArray(block)) return out
  for (const [slug, reason] of Object.entries(block)) {
    if (typeof reason === 'string' && reason.trim()) out.set(slug, reason.trim())
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
