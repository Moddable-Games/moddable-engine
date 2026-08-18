// Frontmatter validation.
//
// This file previously rejected 27% of the corpus it exists to validate,
// which made it worse than useless: a variant author who ran it got a false
// failure on a file the engine loads happily. Four separate defects, all
// measured against the 563 frontmatter files in moddable-rules:
//
//   1. `engine.pieces` was required to be an array of {name, movement}, but
//      produce.js:19-22 accepts either that or the object form
//      `{ set, vocabulary }`. 62 of 62 corpus files use the object form, so the
//      validator rejected the entire corpus while the engine loaded it happily.
//      Both shapes are now accepted and each validated on its own terms.
//   2. `parent` was required unconditionally. Family rulebooks have no parent
//      by definition; 54 files, almost all rulebooks, failed on this.
//   3. `players` was required at the top level. The corpus declares it at
//      `engine.players`; only 67% carry a top-level one.
//   4. It was called on two different shapes — raw frontmatter by loader.js
//      and schema.js, a resolved engine block by cascade-resolver.js:165 —
//      with no way to tell them apart.
//
// The fix keeps every check that was measuring something real and drops the
// ones that were measuring the validator's own assumptions.

const ALWAYS_REQUIRED = ['title', 'slug']

// A resolved engine block has no frontmatter envelope, so the identity fields
// are absent by construction rather than by omission.
function looksResolved(meta) {
  return meta && meta.title === undefined && meta.slug === undefined
    && (meta.topology !== undefined || meta.surface !== undefined || meta.plugins !== undefined)
}

// A family hub describes the family, so it has no parent to point at.
function looksLikeRulebook(meta) {
  return meta && meta.parent === undefined && meta.slug !== undefined
    && (meta.family !== undefined || meta.variants !== undefined || meta.slug === meta.title?.toLowerCase())
}

export function validate(meta, topologySchemas = [], opts = {}) {
  const errors = []
  const schemaMap = new Map(topologySchemas.map(s => [s.type, s]))

  // A resolved block is validated for engine shape only. It never had a
  // title or a slug, and demanding them is how this function came to reject
  // its own callers' output.
  const kind = opts.kind || (looksResolved(meta) ? 'resolved' : 'frontmatter')
  const engine = kind === 'resolved' ? meta : meta?.engine

  if (kind === 'frontmatter') {
    for (const field of ALWAYS_REQUIRED) {
      if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
        errors.push({ field, message: `required field "${field}" is missing` })
      }
    }
    const isRulebook = opts.isRulebook !== undefined ? opts.isRulebook : looksLikeRulebook(meta)
    if (!isRulebook && (meta.parent === undefined || meta.parent === '')) {
      errors.push({ field: 'parent', message: 'required field "parent" is missing (the family this variant belongs to)' })
    }
    // A family rulebook may be documentation only — econopoly, harvesters and
    // hyper-imperium describe games the engine does not implement. Requiring
    // an engine block there rejects a legitimate file.
    if (!meta.engine) {
      if (!isRulebook) {
        errors.push({ field: 'engine', message: 'engine block is required for a playable variant' })
      }
      return { valid: errors.length === 0, errors }
    }
  }

  if (!engine) return { valid: errors.length === 0, errors }

  if (engine.topology) {
    const topo = engine.topology
    if (!topo.type) {
      errors.push({ field: 'engine.topology.type', message: 'topology type is required' })
    } else if (schemaMap.has(topo.type)) {
      const topoSchema = schemaMap.get(topo.type)
      for (const field of topoSchema.required) {
        if (topo[field] === undefined) {
          errors.push({ field: `engine.topology.${field}`, message: `"${field}" is required for topology type "${topo.type}"` })
        }
      }
      if (typeof topoSchema.validate === 'function' && !topoSchema.validate(topo)) {
        errors.push({ field: 'engine.topology', message: `invalid configuration for topology type "${topo.type}"` })
      }
    } else if (topologySchemas.length > 0) {
      const known = topologySchemas.map(s => s.type).join(', ')
      errors.push({ field: 'engine.topology.type', message: `unknown topology type "${topo.type}", must be one of: ${known}` })
    }
  }

  if (engine.players !== undefined) {
    if (!Array.isArray(engine.players) || engine.players.length < 1) {
      errors.push({ field: 'engine.players', message: 'engine.players must be a non-empty array' })
    }
  }

  // `engine.pieces` legitimately takes two shapes, and produce.js:19-22
  // consumes both: an array of { name, movement } movement definitions, or an
  // object { set, vocabulary } selecting artwork. 62 of 62 corpus files use the
  // object form; the array form is exercised by the schema proof tests. The
  // original validator required an array and so rejected the entire corpus.
  if (engine.pieces !== undefined) {
    if (Array.isArray(engine.pieces)) {
      for (let i = 0; i < engine.pieces.length; i++) {
        const piece = engine.pieces[i]
        if (!piece || typeof piece !== 'object') {
          errors.push({ field: `engine.pieces[${i}]`, message: 'piece must be an object with a name and a movement definition' })
          continue
        }
        if (!piece.name) {
          errors.push({ field: `engine.pieces[${i}].name`, message: 'piece must have a name' })
        }
        if (!piece.movement) {
          errors.push({ field: `engine.pieces[${i}].movement`, message: 'piece must have a movement definition' })
        }
      }
    } else if (typeof engine.pieces !== 'object') {
      errors.push({
        field: 'engine.pieces',
        message: 'engine.pieces must be either an artwork selector, e.g. { set: "mce-chess" }, '
          + 'or an array of { name, movement } definitions',
      })
    } else {
      if (engine.pieces.set !== undefined && typeof engine.pieces.set !== 'string') {
        errors.push({ field: 'engine.pieces.set', message: 'engine.pieces.set must be a piece-set id string' })
      }
      if (engine.pieces.vocabulary !== undefined && typeof engine.pieces.vocabulary !== 'object') {
        errors.push({ field: 'engine.pieces.vocabulary', message: 'engine.pieces.vocabulary must be an object' })
      }
    }
  }

  // Vocabulary maps a piece type to its symbols, keyed by owner index.
  const vocab = engine.vocabulary
  if (vocab !== undefined) {
    if (typeof vocab !== 'object' || Array.isArray(vocab)) {
      errors.push({ field: 'engine.vocabulary', message: 'engine.vocabulary must be an object keyed by piece type' })
    } else {
      for (const [type, def] of Object.entries(vocab)) {
        if (!def || typeof def !== 'object') {
          errors.push({ field: `engine.vocabulary.${type}`, message: 'must be an object with a symbols map' })
        } else if (def.symbols !== undefined && (typeof def.symbols !== 'object' || Array.isArray(def.symbols))) {
          errors.push({ field: `engine.vocabulary.${type}.symbols`, message: 'symbols must be an object keyed by owner index, e.g. { 0: P, 1: p }' })
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
