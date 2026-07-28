// Serialising the live board back to a setup string is the half of the render
// loop that decides whether a piece is drawn at all. It is driven entirely by
// the vocabulary the plugin declares, which is the same vocabulary the
// variant's frontmatter uses, so the symbols emitted here are the ones the
// piece set resolves.
//
// This lives in a package rather than in the play page because it is the part
// worth testing: when it was inline browser code, draughts men serialised to
// symbols that resolved to chess artwork and nothing caught it.

export function cellToSymbol(cell, vocabulary = {}) {
  if (cell === null || cell === undefined) return null

  // Go keeps bare colour strings; owner 0 is the first declared player.
  if (typeof cell === 'string') {
    const stone = vocabulary.stone || Object.values(vocabulary)[0]
    return stone?.symbols?.[cell === 'black' ? 0 : 1] ?? null
  }

  // Reversi keeps raw owner indices against a single piece type.
  if (typeof cell === 'number') {
    const only = Object.values(vocabulary)[0]
    return only?.symbols?.[cell] ?? null
  }

  const entry = vocabulary[cell.type]
  if (entry) return entry.symbols?.[cell.owner] ?? null

  // Shogi models a promoted piece as its own type. The canonical notation
  // writes it as the base symbol behind a "+".
  if (typeof cell.type === 'string' && cell.type.startsWith('promoted_')) {
    const base = vocabulary[cell.type.slice('promoted_'.length)]
    const symbol = base?.symbols?.[cell.owner]
    return symbol ? `+${symbol}` : null
  }

  return null
}

export function boardToSetup(slice, topo = {}, vocabulary = {}) {
  const board = slice.board || []
  if (!Array.isArray(board)) return ''
  const cols = topo.cols || Math.round(Math.sqrt(board.length))
  const rows = topo.rows || Math.round(board.length / cols)

  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const symbol = cellToSymbol(board[r * cols + c], vocabulary)
      if (!symbol) { empty++; continue }
      if (empty > 0) { row += empty; empty = 0 }
      row += symbol
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  return fenRows.join('/')
}

// Every symbol boardToSetup can emit, so a test can assert each one resolves to
// artwork rather than discovering it at render time.
export function emittableSymbols(vocabulary = {}) {
  const symbols = []
  for (const [type, def] of Object.entries(vocabulary)) {
    for (const [owner, symbol] of Object.entries(def.symbols || {})) {
      symbols.push({ type, owner: Number(owner), symbol })
    }
  }
  return symbols
}
