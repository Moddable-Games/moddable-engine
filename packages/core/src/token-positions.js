/**
 * One reader and one writer for token positions on a track.
 *
 * A track game with one token per seat keeps those tokens in a list of
 * positions, not in cells, and writes them as `pos-11:p0,pos-1:p1`: the square
 * each seat stands on. The serialiser wrote that string and the renderer read
 * it, but the plugin that plays the game never did, so a game created from a
 * written position put every token back on the start square (engine#202).
 */

const TOKEN = /^pos-(\d+):p(\d+)$/

export function writeTokenPositions(positions) {
  return positions.map((pos, seat) => `pos-${pos}:p${seat}`).join(',')
}

// Whether a setup string is written in this notation at all.
export function isTokenPositions(setup) {
  return typeof setup === 'string' && TOKEN.test(setup.split(',')[0].trim())
}

// `[{ square: 'pos-11', pos: 11, seat: 0 }, ...]`, in the order written.
// Entries that are not tokens are skipped.
export function readTokenPositions(setup) {
  if (typeof setup !== 'string') return []
  const tokens = []
  for (const entry of setup.split(',')) {
    const match = TOKEN.exec(entry.trim())
    if (match) tokens.push({ square: `pos-${match[1]}`, pos: Number(match[1]), seat: Number(match[2]) })
  }
  return tokens
}
