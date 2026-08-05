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

export const international = {
  key: 'international',
  setup: '1b1b1b1b1b/b1b1b1b1b1/1b1b1b1b1b/b1b1b1b1b1/10/10/1w1w1w1w1w/w1w1w1w1w1/1w1w1w1w1w/w1w1w1w1w1',
  label: 'International Draughts',
  group: 'Large Board (10×10)',
  description: 'The competitive standard: flying kings, men capture in every direction, and the longest capture chain is compulsory.',
  rule: 'Board: 10×10 · 20 pieces · Longest chain compulsory',
  rows: 10,
  cols: 10,
  piecesPerPlayer: 20,
  directions: 'diagonal',
  manCapture: 'all',
  manMove: 'forward',
  captureBackward: true,
  forcedCapture: true,
  maximalCapture: true,
  flyingKings: true,
  removeImmediately: false,
  playerNames: PLAYERS,
}

export const brazilian = {
  key: 'brazilian',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  extends: 'international',
  label: 'Brazilian Draughts',
  group: 'Standard Board (8×8)',
  description: 'International rules played on the 8×8 board: flying kings, majority capture, and delayed removal.',
  rule: 'Board: 8×8 · 12 pieces · International rules',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
}

export const canadian = {
  key: 'canadian',
  setup: '1b1b1b1b1b1b/b1b1b1b1b1b1/1b1b1b1b1b1b/b1b1b1b1b1b1/1b1b1b1b1b1b/12/12/w1w1w1w1w1w1/1w1w1w1w1w1w/w1w1w1w1w1w1/1w1w1w1w1w1w/w1w1w1w1w1w1',
  extends: 'international',
  label: 'Canadian Draughts',
  group: 'Large Board (12×12)',
  description: 'International rules on the largest standard board, with thirty pieces a side.',
  rule: 'Board: 12×12 · 30 pieces · International rules',
  rows: 12,
  cols: 12,
  piecesPerPlayer: 30,
}

export const russian = {
  key: 'russian',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  label: 'Russian Draughts',
  group: 'Standard Board (8×8)',
  description: 'Men capture backwards, a man promoting mid-chain continues as a king, and the capture chosen is free.',
  rule: 'Board: 8×8 · 12 pieces · Mid-jump promotion',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
  directions: 'diagonal',
  manCapture: 'all',
  manMove: 'forward',
  captureBackward: true,
  forcedCapture: true,
  maximalCapture: false,
  flyingKings: true,
  promotionDuring: true,
  playerNames: PLAYERS,
}

// The prose in this variant's rules file still says four rows and twenty pieces
// a side, which on an eight-row board would leave no opening move. The setup FEN
// below is taken verbatim from the same file and is the playable reading. Now
// that the position is read from the FEN rather than derived from piece counts,
// the prose discrepancy no longer affects play, but it is still worth correcting
// in moddable-rules.
export const spantsiretti = {
  key: 'spantsiretti',
  setup: '1b1b1b1b1b/b1b1b1b1b1/1b1b1b1b1b/10/10/w1w1w1w1w1/1w1w1w1w1w/w1w1w1w1w1',
  extends: 'russian',
  label: 'Spantsiretti',
  group: 'Extended Board (10×8)',
  description: 'Russian Draughts rules on a wider 10×8 board.',
  rule: 'Board: 10×8 · 15 pieces · Russian rules',
  rows: 8,
  cols: 10,
  piecesPerPlayer: 15,
}

export const pool = {
  key: 'pool',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  extends: 'russian',
  label: 'Pool Checkers',
  group: 'Standard Board (8×8)',
  description: 'Men capture in both directions, kings fly, and a man promoting mid-chain continues. The US tournament standard.',
  rule: 'Board: 8×8 · 12 pieces · Flying kings',
}

export const german = {
  key: 'german',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  label: 'German Draughts',
  group: 'Standard Board (8×8)',
  description: 'Men capture in all directions and kings fly, but no majority rule applies to the choice of capture.',
  rule: 'Board: 8×8 · 12 pieces · No majority rule',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
  directions: 'diagonal',
  manCapture: 'all',
  manMove: 'forward',
  captureBackward: true,
  forcedCapture: true,
  maximalCapture: false,
  flyingKings: true,
  playerNames: PLAYERS,
}

export const spanish = {
  key: 'spanish',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  label: 'Spanish Draughts',
  group: 'Standard Board (8×8)',
  description: 'Kings fly and men move forwards only. Where captures tie in length, the one taken by a king is compulsory.',
  rule: 'Board: 8×8 · 12 pieces · Majority with king preference',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
  directions: 'diagonal',
  manCapture: 'forward',
  manMove: 'forward',
  forcedCapture: true,
  maximalCapture: true,
  majorityPrefersKing: true,
  flyingKings: true,
  playerNames: PLAYERS,
}

export const czech = {
  key: 'czech',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  label: 'Czech Draughts',
  group: 'Standard Board (8×8)',
  description: 'A capture by a king takes priority over any capture by a man, and a man promoting mid-chain continues as a king.',
  rule: 'Board: 8×8 · 12 pieces · King captures take priority',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
  directions: 'diagonal',
  manCapture: 'forward',
  manMove: 'forward',
  forcedCapture: true,
  maximalCapture: false,
  kingCapturePriority: true,
  flyingKings: true,
  promotionDuring: true,
  playerNames: PLAYERS,
}

export const italian = {
  key: 'italian',
  setup: '1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1',
  label: 'Italian Draughts',
  group: 'Standard Board (8×8)',
  description: 'Men may not capture kings, and a strict priority hierarchy governs which capture must be taken.',
  rule: 'Board: 8×8 · 12 pieces · Men cannot capture kings',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 12,
  directions: 'diagonal',
  manCapture: 'forward',
  manMove: 'forward',
  forcedCapture: true,
  maximalCapture: true,
  menCannotCaptureKings: true,
  flyingKings: false,
  playerNames: PLAYERS,
}

export const turkish = {
  key: 'turkish-draughts',
  setup: '8/bbbbbbbb/bbbbbbbb/8/8/wwwwwwww/wwwwwwww/8',
  label: 'Turkish Draughts',
  group: 'Standard Board (8×8)',
  description: 'Orthogonal movement across all sixty-four squares, with the majority capture rule.',
  rule: 'Board: 8×8 · 16 pieces · Orthogonal movement',
  rows: 8,
  cols: 8,
  piecesPerPlayer: 16,
  directions: 'orthogonal',
  manCapture: 'forward',
  manMove: 'forward',
  forcedCapture: true,
  maximalCapture: true,
  flyingKings: true,
  playerNames: PLAYERS,
}

export const ghanaian = {
  key: 'ghanaian',
  setup: '1b1b1b1b1b/b1b1b1b1b1/1b1b1b1b1b/b1b1b1b1b1/10/10/1w1w1w1w1w/w1w1w1w1w1/1w1w1w1w1w/w1w1w1w1w1',
  extends: 'international',
  label: 'Ghanaian Draughts',
  group: 'Large Board (10×10)',
  description: 'Men capture forwards only, and a player reduced to a single piece has lost.',
  rule: 'Board: 10×10 · 20 pieces · One piece remaining loses',
  manCapture: 'forward',
  captureBackward: false,
  loseOnSinglePiece: true,
}

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
