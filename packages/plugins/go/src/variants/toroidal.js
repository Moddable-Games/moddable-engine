export const toroidal = {
  key: 'toroidal-go',
  extends: 'standard',
  label: 'Toroidal Go',
  group: 'Rule Variants',
  description: 'Edges wrap horizontally and vertically, so every intersection has exactly four neighbours. No corners, no edges, no joseki.',
  rule: 'Board: 11×11 · Win: Most territory · Wrapping edges',
  size: 11,
  komi: 4.5,
  topology: { wrap: 'both' },
}
