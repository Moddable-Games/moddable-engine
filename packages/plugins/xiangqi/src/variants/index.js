// Variant parameters follow the xiangqi hub in moddable-rules. setup is copied
// verbatim from each variant's frontmatter and is the same string the published
// board diagram is drawn from.

const PLAYERS = ['red', 'black']

export const standard = {
  key: 'standard',
  setup: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR',
  label: 'Standard Xiangqi',
  group: 'Chinese Chess',
  description: 'The classical game: a river divides the board, generals are confined to their palaces, and the cannon captures by jumping a screen.',
  rule: 'Board: 9×10 · Win: Checkmate the General',
  rows: 10,
  cols: 9,
  hasRiver: true,
  flyingGeneralRule: true,
  cannonJumpToMove: false,
  playerNames: PLAYERS,
}

// Variants held back until the plugin models the mechanic each one needs.
// Verified rather than assumed: each was built from its rules setup and the
// result inspected.
export const UNSUPPORTED = {
  // The palace test is written for a 9x10 board (files d-f, ranks 1-3 and 8-10).
  // On these smaller boards the general starts outside its own palace and has no
  // legal move at all, so they cannot be registered until the palace is derived
  // from board size rather than hardcoded.
  minixiangqi: 'palace geometry is hardcoded to 9x10; on this 7x7 board the general starts outside it',
  'xiangqi-42': 'palace geometry is hardcoded to 9x10; on this 7x6 board the general starts outside it',
  'quang-trung': 'palace geometry is hardcoded to 9x10, and pawn promotion as an alternate win condition is not modelled',

  // These parse from their setup but would play to the wrong rules.
  janggi: 'palace diagonals, the Korean elephant move and the bikjang rule are not modelled',
  'manchu-plus': 'the Banner piece, combining chariot, cannon and horse, is not a modelled piece type',
  'yang-qi': 'substitutes FIDE pieces and extends the cannon to diagonals',
  jieqi: 'hidden information: pieces start face down and reveal on first move',
  'san-kwo-ki': 'three-player hexagonal trisected board (see engine issue #26)',
}
