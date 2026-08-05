// All draughts variant data migrated to frontmatter.
// Variants registered via playable: true in their .md files.
// No draughts variant carries JS functions — this file is intentionally empty.

export const UNSUPPORTED = {
  bashni: 'column stacking: captured pieces are carried beneath the capturer rather than removed',
  lasca: 'column stacking on a 7×7 board',
  dameo: 'linear movement of whole rows of pieces',
  alquerque: '5×5 point-and-line board rather than a square grid',
  frisian: 'mixed orthogonal and diagonal capture with a three-move king limit',
  thai: 'flying kings constrained to stop immediately behind the captured piece',
  diagonal: 'pieces set up along the anti-diagonal rather than in ranks',
}
