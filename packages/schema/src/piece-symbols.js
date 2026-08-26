// Turning a board symbol into the artwork key for a piece, in one place.
//
// The grid renderer knew how: it rebuilt `{ type, owner }` from the FEN and
// the vocabulary, then mapped the type to a gallery key - `stone` plus an
// owner prefix gives `bS` or `wS`. The graph and hex renderers did neither.
// They looked the raw symbol up directly, so `pieceImages['b']` missed every
// time while `pieceImages['bS']` sat right there, and morris, hex and Y all
// rendered boards with no pieces on them while passing every test that did not
// look at a rendered board.

// Types the gallery keys by initial rather than by name.
const KEYED_BY_INITIAL = { stone: 'S', man: 'M', king: 'K', piece: 'P' }

// The keys to try, in order. A single-piece set is keyed `bS`/`wS` whatever
// the game calls its piece, so a morris `man` drawn from the go stone set has
// to fall back to the colour-and-stone key or it finds nothing. Returning the
// order rather than one answer keeps that fallback visible instead of buried
// in each renderer.
export function pieceImageKeys(piece) {
  if (!piece) return []
  const type = typeof piece === 'string' ? piece : piece.type
  if (!type) return []
  // The prefix is the colour, and the variant says which seat is which. Hex
  // and Go both declare seat 0 as `b`; deriving the prefix from the seat index
  // gave both of them white stones for black and black for white. Where the
  // vocabulary symbol is itself a colour letter, that is the answer; only
  // where it is not - chess, whose symbols are piece letters - does the seat
  // decide.
  const owner = typeof piece === 'object' ? piece.owner : undefined
  const symbol = typeof piece === 'object' ? piece.symbol : undefined
  const colourLetter = typeof symbol === 'string' && /^[wb]$/i.test(symbol)
    ? symbol.toLowerCase()
    : null
  const prefix = colourLetter || (owner === 0 ? 'w' : 'b')
  const keys = []
  // The board symbol first. A four-player set is keyed by exactly that - `rC`
  // for the red chief - and resolving the symbol to a type before looking it
  // up threw those keys away: djambi went from 36 pieces drawn to none, and
  // every vierschach board from 64 to 3. `pieceImageKey` takes the first
  // candidate the gallery actually has, so an unhelpful one costs nothing.
  if (symbol) keys.push(symbol)
  const initial = KEYED_BY_INITIAL[type]
  if (initial) keys.push(prefix + initial)
  keys.push(type)
  if (!initial) keys.push(prefix + type)
  keys.push(prefix + 'S')
  return [...new Set(keys.filter(Boolean))]
}

export function pieceImageKey(piece, images) {
  const keys = pieceImageKeys(piece)
  if (!images) return keys[0] ?? null
  return keys.find(k => images[k]) ?? keys[0] ?? null
}

// The inverse of `cellToSymbol`: given a board symbol and the vocabulary that
// produced it, recover the type and the owner. Without the owner a symbol is
// only half a piece, which is why the two topologies that skipped this step
// could not pick artwork.
export function symbolToPiece(symbol, vocabulary = {}) {
  if (symbol === null || symbol === undefined || symbol === '') return null
  const text = String(symbol)
  for (const [type, entry] of Object.entries(vocabulary)) {
    const symbols = entry?.symbols || {}
    for (const [owner, sym] of Object.entries(symbols)) {
      if (sym === text) return { type, owner: Number(owner), symbol: text }
    }
  }
  // A symbol the vocabulary does not claim is passed through as its own type,
  // which is what a variant declaring artwork by piece name relies on.
  return { type: text, symbol: text }
}
