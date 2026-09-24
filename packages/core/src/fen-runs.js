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
  // A rank of comma-separated tokens is the four-player form: `3,yR,yN,2`,
  // where a seat letter prefixes every piece. Each token is a count or one
  // symbol. It had three readers of its own (the grid topology, the renderer
  // and the create page), each with its own loop.
  if (rank.includes(',')) return parseCommaRuns(rank)
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

function parseCommaRuns(rank) {
  const runs = []
  for (const raw of rank.split(',')) {
    const token = raw.trim()
    if (!token) continue
    if (/^\d+$/.test(token)) runs.push({ skip: parseInt(token, 10) })
    else runs.push({ symbol: token })
  }
  return runs
}

/**
 * The one writer, and `readPosition`'s inverse. `ranks` is one array per rank,
 * each cell a symbol or null. A symbol longer than one character is bracketed,
 * or, with `commas`, every token is separated and none is bracketed - the form
 * the four-player boards are written in.
 *
 * `promotion` reads a leading `+` as the promotion marker `readPosition`
 * reports, and writes it outside the brackets. Without it `+P` is a symbol of
 * its own, which is how a vocabulary that names promoted types spells them.
 */
export function writePosition(ranks, { commas = false, promotion = false } = {}) {
  return ranks.map(cells => {
    const tokens = []
    let empty = 0
    for (const symbol of cells) {
      if (symbol === null || symbol === undefined || symbol === '') { empty++; continue }
      if (empty > 0) { tokens.push(String(empty)); empty = 0 }
      // `+` marks a promoted piece and is not part of its symbol.
      const text = String(symbol)
      const promoted = promotion && text.length > 1 && text.startsWith('+')
      const base = promoted ? text.slice(1) : text
      tokens.push((promoted ? '+' : '') + (commas || base.length === 1 ? base : `[${base}]`))
    }
    if (empty > 0) tokens.push(String(empty))
    return tokens.join(commas ? ',' : '')
  }).join('/')
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
