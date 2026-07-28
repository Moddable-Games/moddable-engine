// Variant parameters follow the shogi hub in moddable-rules. setup is copied
// verbatim from each variant's frontmatter and is the same string the published
// board diagram is drawn from.

const PLAYERS = ['sente', 'gote']

export const standard = {
  key: 'standard',
  setup: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL',
  label: 'Standard Shogi',
  group: 'Standard Form',
  description: 'The full game: captured pieces change allegiance and may be dropped back onto the board on any later turn.',
  rule: 'Board: 9×9 · Win: Capture the King · Drops',
  rows: 9,
  cols: 9,
  promotionZone: 3,
  playerNames: PLAYERS,
}

export const minishogi = {
  key: 'minishogi',
  setup: 'rbsgk/4p/5/P4/KGSBR',
  label: 'Minishogi',
  group: 'Smaller Board Variants',
  description: 'Shogi condensed to a 5×5 board with five pieces a side. Drops and promotion are unchanged.',
  rule: 'Board: 5×5 · Win: Capture the King · Drops',
  rows: 5,
  cols: 5,
  promotionZone: 1,
  playerNames: PLAYERS,
}

export const judkins = {
  key: 'judkins-shogi',
  setup: 'rbsgkn/5p/6/6/P5/NKGSBR',
  label: "Judkins' Shogi",
  group: 'Smaller Board Variants',
  description: 'A 6×6 condensation retaining every piece type, giving fast tactical play.',
  rule: 'Board: 6×6 · Win: Capture the King · Drops',
  rows: 6,
  cols: 6,
  promotionZone: 2,
  playerNames: PLAYERS,
}

// Variants held back until the plugin models the mechanic each one needs.
// Verified rather than assumed: each was built from its rules setup and the
// result inspected.
export const UNSUPPORTED = {
  // These parse and produce the right piece count, but would play to the wrong
  // rules, which is worse than being absent.
  'heian-shogi': 'predates the drop rule; the plugin has no way to disable drops',
  'gorogoro-plus': 'the knight and lance start in hand, and hands always start empty',
  'mortal-shogi': 'captured pieces demote along a ranking chain rather than returning to base form',

  // New piece types beyond king, rook, bishop, gold, silver, knight, lance, pawn.
  'sho-shogi': 'the Drunken Elephant, which promotes to a second royal piece',
  'chu-shogi': '12x12 with 46 pieces a side including the Lion',
  'dai-shogi': '15x15 with 65 pieces a side',
  'tenjiku-shogi': '16x16 with Fire Demons that burn adjacent enemies',
  'maka-dai-dai-shogi': '19x19 with 50 piece types a side',
  'tai-shogi': '25x25 with roughly 177 piece types a side',
  'taikyoku-shogi': '36x36 with 402 pieces a side',
  'tori-shogi': 'bird-themed piece set with its own movement',
  'wa-shogi': 'animal-themed piece set with its own movement',
  'yari-shogi': 'spear-themed pieces replacing lance, knight and pawn',
  dobutsu: 'a 3x4 children\'s game with its own piece set',

  // Distinct mechanics rather than distinct pieces.
  'kyoto-shogi': 'every piece flips to its alternate face after each move',
  'annan-shogi': 'a piece moves using the move of the allied piece behind it',
  'cannon-shogi': 'four cannon types drawn from xiangqi and janggi',
  'hasami-shogi': 'custodial capture with one piece type, no drops and no promotion',
  'hex-shogi-91': 'hexagonal board',
  'sankaku-shogi': 'triangular board',
  'four-player-shogi': 'cross-shaped board with four armies',
}
