// Variant parameters follow the draughts hub in moddable-rules
// (games/draughts/content/rulebook.md and its variant files).
//
// Every entry below is expressible through the plugin's existing parametric
// knobs. Variants that need mechanics the plugin does not yet model are listed
// in UNSUPPORTED at the foot of this file rather than being approximated.
//
// setup is the starting position, copied verbatim from the variant's
// frontmatter. It is the same string the published board diagram is drawn from,
// and the start-position test asserts the two stay in step.

const PLAYERS = ['white', 'black']

export const english = {
  key: 'english',
}

export const international = { key: 'international' }
export const brazilian = { key: 'brazilian' }
export const canadian = { key: 'canadian' }
export const russian = { key: 'russian' }
export const spantsiretti = { key: 'spantsiretti' }
export const pool = { key: 'pool' }

export const german = {
  key: 'german',
}

export const spanish = {
  key: 'spanish',
}

export const czech = {
  key: 'czech',
}

export const italian = {
  key: 'italian',
}

export const turkish = {
  key: 'turkish-draughts',
}

export const ghanaian = { key: 'ghanaian' }

// Variants held back from the registry until the plugin models the mechanic
// each one turns on. Listed so the gap is visible rather than silently missing.
export const UNSUPPORTED = {
  bashni: 'column stacking: captured pieces are carried beneath the capturer rather than removed',
  lasca: 'column stacking on a 7×7 board',
  dameo: 'linear movement of whole rows of pieces',
  alquerque: '5×5 point-and-line board rather than a square grid',
  frisian: 'mixed orthogonal and diagonal capture with a three-move king limit',
  thai: 'flying kings constrained to stop immediately behind the captured piece',
  diagonal: 'pieces set up along the anti-diagonal rather than in ranks',
}
