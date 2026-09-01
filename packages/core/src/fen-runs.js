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

/**
 * One walk over a rank-based position string.
 *
 * `parseRankRuns` gave every caller the same tokeniser, and then six callers
 * each wrote their own walk over its output - or, in three cases, their own
 * tokeniser as well. They drifted, as copies do:
 *
 *   render-engine  parseSfenToPosition   its own char loop, and it read an
 *                                        UPPERCASE symbol as gote when
 *                                        uppercase is sente, so every
 *                                        bracketed board drew both camps in
 *                                        the other camp's pieces
 *   play/fen.js    parseBoardWithPromotions  its own char loop; brackets were
 *                                        added to it separately
 *   js/create-state parseSetup           its own regex; multi-character codes
 *                                        came apart into their letters
 *   topology-grid  parsePosition         parseRankRuns, but no `+` handling
 *
 * A promoted piece is written `+P`, and whether that is one cell or two is
 * exactly the kind of question six implementations will answer differently.
 * It is answered here.
 *
 * Returns the cells in reading order and the width each rank actually spans,
 * so a caller that wants to reject a malformed rank still can.
 */
export function readPosition(position, { rows = Infinity } = {}) {
  const ranks = String(position).split(' ')[0].split('/')
  const cells = []
  const widths = []
  for (let row = 0; row < ranks.length && row < rows; row++) {
    let col = 0
    let promoted = false
    for (const run of parseRankRuns(ranks[row])) {
      if (run.skip !== undefined) {
        col += run.skip
        promoted = false
        continue
      }
      // `+` is a modifier on the symbol that follows it, not a cell of its own.
      if (run.symbol === '+') {
        promoted = true
        continue
      }
      cells.push({ row, col, symbol: run.symbol, promoted })
      promoted = false
      col++
    }
    widths.push(col)
  }
  return { cells, widths, rankCount: ranks.length }
}
