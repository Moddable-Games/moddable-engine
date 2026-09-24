// Lossless carriage for the create page (engine#118).
//
// The editor models some of a variant's engine block and not the rest. It used
// to rebuild the block from its own controls, so everything it did not model
// was dropped on the way out: of 239 playable variants, 44 survived an import
// and export unchanged. A turn order, a pawn configuration, a set of layered
// boards or a family default the form disagreed with were all silently lost,
// and "Try in Play" played a different game from the one loaded.
//
// So the editor now carries the block it was given, and applies to it only what
// the user changed. At import it records two things:
//
//   source    the variant's engine block, exactly as read
//   baseline  the block the editor's own controls produced at that moment
//
// On the way out, every leaf that differs between `baseline` and what the
// controls produce now is an edit, and only edits are written onto `source`.
// A variant nobody touched comes back as it went in; a control added later
// needs no carriage code of its own.
//
// Arrays are leaves: a list of void cells is one value, replaced whole.

export function applyEdits(source, baseline, current) {
  const out = clone(source)
  mergeInto(out, baseline, current)
  return out
}

function mergeInto(target, before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  for (const key of keys) {
    const was = before?.[key]
    const now = after?.[key]
    if (same(was, now)) continue
    if (now === undefined) {
      delete target[key]
    } else if (isPlainObject(now) && isPlainObject(was) && isPlainObject(target[key])) {
      mergeInto(target[key], was, now)
    } else if (isPlainObject(now) && isPlainObject(target[key])) {
      // New to the editor but already in the source: merge rather than replace,
      // so the source's own keys beside it survive.
      mergeInto(target[key], {}, now)
    } else {
      target[key] = clone(now)
    }
  }
}

export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
