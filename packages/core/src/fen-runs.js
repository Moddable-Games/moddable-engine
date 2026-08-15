/**
 * One reader for a FEN rank.
 *
 * A rank is a run of piece symbols and numbers, where a number is a count of
 * empty cells. On a board of nine files or fewer every count is a single digit
 * and any reader works. Above nine they are not, and three readers in this repo
 * disagreed about what `20` means:
 *
 *   render-engine.js  fenToPosition   two digits, so `20` is twenty. Correct
 *                                     up to 99, wrong above it
 *   chess-plugin.js   parseFENtoArray one digit, and `0` is not a digit at all,
 *                                     so `20` skipped two cells and then wrote
 *                                     a piece for the symbol `0`
 *   topology-grid.js  parsePosition   one digit, `0` skips nothing, so `20`
 *                                     skipped two cells and said nothing
 *
 * The effect on a 22-wide board built in the create page: it drew correctly and
 * played with every piece after the first gap in the wrong place, differently
 * depending on which family was loading it. Nothing threw.
 *
 * `[...]` is crazyhouse-style bracketed notation for a multi-character symbol.
 */

export function parseRankRuns(rank) {
  const runs = []
  let i = 0
  while (i < rank.length) {
    const ch = rank[i]

    if (ch >= '0' && ch <= '9') {
      let j = i
      while (j < rank.length && rank[j] >= '0' && rank[j] <= '9') j++
      runs.push({ skip: parseInt(rank.slice(i, j), 10) })
      i = j
      continue
    }

    if (ch === '[') {
      const close = rank.indexOf(']', i)
      if (close === -1) { i++; continue }
      runs.push({ symbol: rank.slice(i + 1, close) })
      i = close + 1
      continue
    }

    runs.push({ symbol: ch })
    i++
  }
  return runs
}

/**
 * Split a position string into ranks and read each one. Returns an array of
 * arrays of runs, one per rank.
 */
export function parsePositionRuns(position) {
  return String(position).split(' ')[0].split('/').map(parseRankRuns)
}
