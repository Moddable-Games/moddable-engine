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

export const minixiangqi = {
  key: 'minixiangqi',
}

export const xiangqi42 = {
  key: 'xiangqi-42',
  setup: 'rhakahr/1c3c1/p2p2p/P2P2P/1C3C1/RHAKAHR',
  label: 'Xiangqi 42',
  group: 'Smaller Board Variants',
  description: 'Compact 7x6 board (42 intersections). No river, no elephants. Fast tactical play.',
  rule: 'Board: 7×6 · Win: Checkmate the General',
  rows: 6,
  cols: 7,
  hasRiver: false,
  flyingGeneralRule: true,
  palace: { cols: [2, 4], rows: [[3, 5], [0, 2]] },
  playerNames: PLAYERS,
}

export const UNSUPPORTED = {
  'quang-trung': 'pawn promotion as an alternate win condition is not modelled',
  janggi: 'palace diagonals, the Korean elephant move and the bikjang rule are not modelled',
  'manchu-plus': 'the Banner piece, combining chariot, cannon and horse, is not a modelled piece type',
  'yang-qi': 'substitutes FIDE pieces and extends the cannon to diagonals',
  jieqi: 'hidden information: pieces start face down and reveal on first move',
  'san-kwo-ki': 'three-player hexagonal trisected board (see engine issue #26)',
}
