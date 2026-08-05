// All xiangqi variant data migrated to frontmatter.
// Variants registered via playable: true in their .md files.

export const UNSUPPORTED = {
  'quang-trung': 'pawn promotion as an alternate win condition is not modelled',
  janggi: 'palace diagonals, the Korean elephant move and the bikjang rule are not modelled',
  'manchu-plus': 'the Banner piece, combining chariot, cannon and horse, is not a modelled piece type',
  'yang-qi': 'substitutes FIDE pieces and extends the cannon to diagonals',
  jieqi: 'hidden information: pieces start face down and reveal on first move',
  'san-kwo-ki': 'three-player hexagonal trisected board (see engine issue #26)',
}
