// Variant parameters follow the shogi hub in moddable-rules. setup is copied
// verbatim from each variant's frontmatter and is the same string the published
// board diagram is drawn from.

const PLAYERS = ['sente', 'gote']

export const standard = {
  key: 'standard',
}

export const minishogi = {
  key: 'minishogi',
}

export const judkins = {
  key: 'judkins-shogi',
}

export const heian = {
  key: 'heian-shogi',
}

export const gorogoroPlus = {
  key: 'gorogoro-plus',
}

// Variants held back until the plugin models the mechanic each one needs.
// Verified rather than assumed: each was built from its rules setup and the
// result inspected.
export const UNSUPPORTED = {
  // These parse and produce the right piece count, but would play to the wrong
  // rules, which is worse than being absent.
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
