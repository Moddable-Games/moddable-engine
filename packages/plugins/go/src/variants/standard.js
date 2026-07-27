export const standard = {
  key: 'standard',
  label: 'Go 19×19',
  group: 'Standard',
  description: 'The full-size game. Surround territory, capture stones, and hold more of the board than your opponent at the close.',
  rule: 'Board: 19×19 · Win: Most territory',
  size: 19,
  komi: 6.5,
  scoring: 'territory',
  superko: true,
  suicideAllowed: false,
}

export const go13 = {
  key: '13x13',
  extends: 'standard',
  label: 'Go 13×13',
  group: 'Standard',
  description: 'The middle board. Long enough for real whole-board strategy, short enough to finish in a sitting.',
  rule: 'Board: 13×13 · Win: Most territory',
  size: 13,
  komi: 6.5,
}

export const go9 = {
  key: '9x9',
  extends: 'standard',
  label: 'Go 9×9',
  group: 'Standard',
  description: 'The teaching board. Fighting starts immediately and every stone matters.',
  rule: 'Board: 9×9 · Win: Most territory',
  size: 9,
  komi: 5.5,
}

export const oneColour = {
  key: 'one-colour',
  extends: 'standard',
  label: 'One-Colour Go',
  group: 'Handicap and Teaching',
  description: 'Standard rules played with stones of a single colour, so both players must hold the position in memory.',
  rule: 'Board: 19×19 · Win: Most territory · Both sides render identically',
  render: { singleColour: true },
}
