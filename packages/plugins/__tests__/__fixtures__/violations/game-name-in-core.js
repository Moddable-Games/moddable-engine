// Fixture: a non-plugin package file containing a game name.
// check-purity.mjs rule 1 must flag this.
const family = 'chess'
export function getFamily() { return family }
