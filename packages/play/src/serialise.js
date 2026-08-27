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

// A board whose occupied cells are all numbers is a count board. Checked by
// shape rather than by family name, so a new sowing game needs no edit here.
function isCountBoard(board) {
  if (!Array.isArray(board) || board.length === 0) return false
  let seen = 0
  for (const cell of board) {
    if (cell === null || cell === undefined) continue
    if (typeof cell !== 'number') return false
    seen++
  }
  return seen > 0
}

// The board is laid out as every pit, then the stores: for kalah,
// [ ...6 pits, ...6 pits, store0, store1 ]. The corpus writes the same
// position as "4,4,4,4,4,4;0;4,4,4,4,4,4;0", which is what the renderer parses,
// so this is a regrouping rather than a translation.
function pitBoardToSetup(board, slice, topo) {
  const counts = board.map(n => Number(n) || 0)
  // Oware and ayo have no store on the board: captured seeds are held to the
  // side, in `slice.held`. Writing a zero there regardless meant a player
  // could take twenty seeds and the board would show none of them, so there
  // was no way to see who was winning a game whose win condition is exactly
  // that count.
  const heldAside = Array.isArray(slice?.held) ? slice.held : null
  const perSide = topo.cols || topo.pitsPerSide || Math.trunc(counts.length / 2)
  if (!perSide) return counts.join(',')

  const sides = Math.max(2, Math.round(counts.length / perSide) - 1 || 2)
  const pitTotal = perSide * sides
  const pits = counts.slice(0, pitTotal)
  const stores = counts.slice(pitTotal)

  const parts = []
  for (let side = 0; side < sides; side++) {
    parts.push(pits.slice(side * perSide, (side + 1) * perSide).join(','))
    // Where the board has no store, the seeds a player is holding go in the
    // same slot: it is the same quantity, and the renderer draws it in the
    // same bowl.
    parts.push(String(stores[side] ?? heldAside?.[side] ?? 0))
  }
  return parts.join(';')
}

export function boardToSetup(slice, topo = {}, vocabulary = {}, opts = {}) {
  const board = slice.board || []

  // A sowing board holds seed counts, not pieces. Running integers through FEN
  // serialisation produced "2sS2/2sS2" - a piece letter per pit, arrived at by
  // treating a number as a cell - and the pit renderer, handed that, drew its
  // default empty board. Every mancala variant showed twelve empty pits on the
  // play page while the engine had the seeds all along.
  //
  // The format is the one the corpus already writes:
  //   4,4,4,4,4,4;0;4,4,4,4,4,4;0
  if (topo.type === 'pit' || isCountBoard(board)) {
    return pitBoardToSetup(board, slice, topo)
  }

  // A track game keeps its players on the track, not in cells: landlords holds
  // forty nulls in `board` from start to finish and its tokens in `positions`.
  // Serialising the board gave an empty string, so the renderer was handed a
  // board with nobody on it and drew exactly that.
  if (topo.type === 'track' && Array.isArray(slice?.positions)) {
    return slice.positions.map((pos, seat) => `pos-${pos}:p${seat}`).join(',')
  }

  if (!Array.isArray(board)) {
    const entries = []
    for (const [coord, cell] of Object.entries(board)) {
      // `if (!cell)` drops seat 0, because seat 0 is the number 0. Hex and
      // morris store the owner index directly in the cell, so every one of the
      // first player's stones vanished on the way to the renderer and only the
      // second player's appeared on the board.
      if (cell === null || cell === undefined || cell === '') continue
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
