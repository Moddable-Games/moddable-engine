// Fixture: branching on variant slug string.
// check-purity.mjs rule 2 must flag this.
export function render(variant) {
  if (variant === 'standard') return 'default'
  return 'custom'
}
