// Variant parameters follow the xiangqi hub in moddable-rules. setup is copied
// verbatim from each variant's frontmatter and is the same string the published
// board diagram is drawn from.

const PLAYERS = ['red', 'black']

export const standard = {
  key: 'standard',
}

export const minixiangqi = {
  key: 'minixiangqi',
}

export const xiangqi42 = {
  key: 'xiangqi-42',
}

export const UNSUPPORTED = {
  'quang-trung': 'pawn promotion as an alternate win condition is not modelled',
  janggi: 'palace diagonals, the Korean elephant move and the bikjang rule are not modelled',
  'manchu-plus': 'the Banner piece, combining chariot, cannon and horse, is not a modelled piece type',
  'yang-qi': 'substitutes FIDE pieces and extends the cannon to diagonals',
  jieqi: 'hidden information: pieces start face down and reveal on first move',
  'san-kwo-ki': 'three-player hexagonal trisected board (see engine issue #26)',
}
