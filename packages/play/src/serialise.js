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

export function boardToSetup(slice, topo = {}, vocabulary = {}, opts = {}) {
  const board = slice.board || []
  if (!Array.isArray(board)) {
    const entries = []
    for (const [coord, cell] of Object.entries(board)) {
      if (!cell) continue
      const sym = cellToSymbol(cell, vocabulary)
      if (sym) entries.push(`${coord}:${sym}`)
    }
    return entries.join(',')
  }
  const cols = topo.cols || Math.round(Math.sqrt(board.length))
  const rows = topo.rows || Math.round(board.length / cols)
  const players = opts.players || []

  if (players.length > 2) {
    return boardToFen4(board, rows, cols, vocabulary, players)
  }

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

function boardToFen4(board, rows, cols, vocabulary, players) {
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    const tokens = []
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const cell = board[r * cols + c]
      if (!cell) { empty++; continue }
      if (empty > 0) { tokens.push(String(empty)); empty = 0 }
      const entry = vocabulary[cell.type]
      const ownerSym = entry?.symbols?.[String(cell.owner)]
      if (ownerSym) {
        tokens.push(ownerSym)
      } else {
        const prefix = players[cell.owner]?.[0]?.toLowerCase() || 'w'
        const letter = entry?.symbols?.['0'] || cell.type[0].toUpperCase()
        tokens.push(prefix + letter)
      }
    }
    if (empty > 0) tokens.push(String(empty))
    fenRows.push(tokens.join(','))
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
