// Fixture: piece type name used in a switch/case.
// check-purity.mjs rule 4 must flag this.
export function getValue(type) {
  switch (type) {
    case 'queen': return 9
    case 'rook': return 5
    case 'bishop': return 3
    default: return 1
  }
}
