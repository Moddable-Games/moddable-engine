/**
 * What each piece in this variant does, worked out by asking the engine.
 *
 * Nothing here is written down. A piece's name is its type, and its moves are
 * whatever the plugin generates for it from a real square - so a legend built
 * this way cannot drift from the rules the way a hand-written description does.
 * That drift is not hypothetical: Congo's page described a river, two castles
 * and a drowning rule for two months while the engine had none of them.
 *
 * It matters more than it used to, because movement is no longer a property of
 * the piece alone. Congo's Crocodile slides differently on each bank and in the
 * water; every Rollerball piece turns with the quarter of the ring it stands
 * in. A single "this is how it moves" diagram would be wrong for both. Where a
 * piece declares itself `positional`, this shows it once per region it names,
 * and the region names come from the frontmatter too.
 */

/**
 * The most representative square of a set: the one nearest the middle of the
 * set itself, not of the board. A piece shown at the edge of the region it is
 * confined to displays the moves it has THERE, which is fewer than it really
 * has - Congo's Lion looked to have five moves rather than eight.
 */
const MIDDLE_OF = (cells, cols) => {
  const list = [...cells]
  if (!list.length) return null
  const cy = list.reduce((n, i) => n + Math.floor(i / cols), 0) / list.length
  const cx = list.reduce((n, i) => n + (i % cols), 0) / list.length
  return list.sort((a, b) => {
    const da = Math.hypot(Math.floor(a / cols) - cy, (a % cols) - cx)
    const db = Math.hypot(Math.floor(b / cols) - cy, (b % cols) - cx)
    return da - db
  })[0]
}

const CENTRE_FIRST = (cells, rows, cols) => {
  const cy = (rows - 1) / 2
  const cx = (cols - 1) / 2
  return [...cells].sort((a, b) => {
    const da = Math.hypot(Math.floor(a / cols) - cy, (a % cols) - cx)
    const db = Math.hypot(Math.floor(b / cols) - cy, (b % cols) - cx)
    return da - db
  })
}

export function humanisePieceName(type) {
  return String(type || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Which types a player will actually meet: everything standing in the position,
 * plus anything a piece can promote into, which is never on the board at the
 * start and is often the strongest thing in the game.
 */
export function pieceTypesInPlay(plugin, slice) {
  const seen = new Set()
  const board = slice && slice.board
  if (Array.isArray(board)) {
    for (const cell of board) if (cell && cell.type) seen.add(cell.type)
  }
  const config = plugin?.config || {}
  // A variant that declares `promotion` has said exactly what its pieces become,
  // so `promotionChoices` is not consulted: it carries the engine's default of
  // queen, rook, bishop, knight whether or not the variant has any of them, and
  // Congo was listing all four beside its Giraffe and Crocodile.
  if (Array.isArray(config.promotion) && config.promotion.length) {
    for (const rule of config.promotion) {
      for (const to of rule.to || []) seen.add(to)
    }
  } else {
    for (const choice of config.promotionChoices || []) {
      if (typeof choice === 'string') seen.add(choice)
    }
  }
  for (const hand of slice?.hands || []) {
    for (const type of hand || []) seen.add(type)
  }
  return [...seen]
}

/** The regions a positional piece names, in the order it names them. */
function regionsFor(plugin, type) {
  const spec = plugin?.pieceConfigs?.[type]
  if (!spec || spec.type !== 'positional' || !Array.isArray(spec.cases)) return null
  // A case with no region is the fallback - where the piece stands the rest of
  // the time - and is as much a part of the answer as the named ones. Congo's
  // pawn showed only its behaviour across the river and not its ordinary move.
  const named = spec.cases.map(c => c.in || null)
  const unique = [...new Set(named)]
  return unique.length ? unique : null
}

/**
 * The region a piece may not leave, wherever it is declared. Congo's Lion wears
 * its `confine` on one part of a `compose` - the king step - rather than at the
 * top of the spec, because its other part is the ranged capture that is the one
 * move allowed to leave the castle.
 */
function findConfine(spec) {
  if (!spec || typeof spec !== 'object') return null
  if (typeof spec.confine === 'string') return spec.confine
  for (const part of spec.parts || []) {
    const found = findConfine(part)
    if (found) return found
  }
  for (const c of spec.cases || []) {
    const found = findConfine(c.move || c.spec)
    if (found) return found
  }
  if (spec.divergent) return findConfine(spec.divergent.move) || findConfine(spec.divergent.capture)
  return null
}

/** Every playable cell of a named region, as declared in frontmatter. */
function regionCells(plugin, name, rows, cols, playable) {
  const spec = plugin?.config?.regions?.[name]
  if (!spec) return null
  const out = []
  const perSeat = (v) => (Array.isArray(v) && Array.isArray(v[0]) ? v[0] : v)
  if (spec.cells) {
    const cells = Array.isArray(spec.cells[0]) && Array.isArray(spec.cells[0][0]) ? spec.cells[0] : spec.cells
    for (const [r, c] of cells) {
      const i = r * cols + c
      if (playable.has(i)) out.push(i)
    }
    return out
  }
  const rowRange = perSeat(spec.rows)
  const colRange = perSeat(spec.cols)
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (rowRange && (r < rowRange[0] || r > rowRange[1])) continue
      if (colRange && (c < colRange[0] || c > colRange[1])) continue
      const i = r * cols + c
      if (playable.has(i)) out.push(i)
    }
  }
  return out
}

/**
 * Build the legend.
 *
 * `probe(slice, seat)` must return the legal moves for a slice - the caller
 * supplies it so this module never reaches for a plugin's internals, and so it
 * works for any family.
 */
/**
 * Pieces to leave standing on every probe board.
 *
 * Some families treat a position with no royal piece as already lost and filter
 * every move away - Xiangqi and Shogi both do, so a lone Chariot on an empty
 * board reported that it could not move at all. Each plugin defaults its own
 * royal type privately (`king`, `general`), so rather than guess, the candidates
 * are the types the opening position holds exactly one of per side, and the
 * caller finds out which one works by trying.
 */
function royalCandidates(slice, cols) {
  const board = slice && slice.board
  if (!Array.isArray(board)) return []
  const bySide = new Map()
  board.forEach((cell, i) => {
    if (!cell || !cell.type) return
    const key = `${cell.type}/${cell.owner}`
    if (!bySide.has(key)) bySide.set(key, [])
    bySide.get(key).push(i)
  })
  const singles = new Map()
  for (const [key, at] of bySide) {
    if (at.length !== 1) continue
    const [type, owner] = key.split('/')
    if (!singles.has(type)) singles.set(type, [])
    singles.get(type).push({ index: at[0], piece: board[at[0]], owner: Number(owner) })
  }
  // Both sides must have exactly one for it to look like a royal.
  return [...singles.entries()].filter(([, ps]) => ps.length === 2).map(([type, ps]) => ({ type, pieces: ps }))
}

export function buildLegend({ plugin, slice, rows, cols, playableCells, probe, seat = 0 }) {
  const playable = playableCells instanceof Set ? playableCells : new Set(playableCells || [])
  if (!playable.size) return []
  const ordered = CENTRE_FIRST(playable, rows, cols)
  const candidates = royalCandidates(slice, cols)
  const entries = []

  // Probe bare first; only prop the position up if the family demands it, so
  // families that already answer plainly keep their uncluttered boards.
  function probeFrom(type, from) {
    const bare = new Array(rows * cols).fill(null)
    bare[from] = { type, owner: seat }
    const ask = (board) => {
      try { return (probe({ ...slice, board }, seat) || []).filter(m => m.from === from) }
      catch { return [] }
    }
    const plain = ask(bare)
    if (plain.length) return { board: bare, moves: plain }
    for (const candidate of candidates) {
      if (candidate.type === type) continue
      const propped = bare.slice()
      let clash = false
      for (const { index, piece } of candidate.pieces) {
        if (index === from) { clash = true; break }
        propped[index] = { ...piece }
      }
      if (clash) continue
      const moves = ask(propped)
      if (moves.length) return { board: propped, moves }
    }
    return null
  }

  // If the chosen square yields nothing, try others. A piece may be confined to
  // a region the frontmatter does not name - Xiangqi's General and Advisor are
  // held to the palace by a rule inside the plugin rather than by a declared
  // region - and standing one outside it produces a piece that appears unable
  // to move at all.
  function probeAnywhere(type, preferred) {
    const first = probeFrom(type, preferred)
    if (first) return { from: preferred, ...first }
    for (const from of ordered) {
      if (from === preferred) continue
      const found = probeFrom(type, from)
      if (found) return { from, ...found }
    }
    return null
  }

  for (const type of pieceTypesInPlay(plugin, slice)) {
    const regions = regionsFor(plugin, type)
    const placements = []

    if (regions) {
      const claimed = new Set()
      for (const region of regions) {
        if (!region) continue
        for (const i of regionCells(plugin, region, rows, cols, playable) || []) claimed.add(i)
      }
      for (const region of regions) {
        if (region === null) {
          // The fallback: anywhere the named regions do not cover.
          const rest = ordered.filter(i => !claimed.has(i))
          if (rest.length) placements.push({ region: 'elsewhere', from: MIDDLE_OF(rest, cols) })
          continue
        }
        const cells = regionCells(plugin, region, rows, cols, playable)
        if (!cells || !cells.length) continue
        placements.push({ region, from: MIDDLE_OF(cells, cols) })
      }
    }
    // A confined piece must be shown inside the region it may not leave.
    // Congo's Lion, stood in the middle of the board, produced the three moves
    // that happened to reach back into its castle and looked crippled.
    if (!placements.length) {
      const bounded = findConfine(plugin?.pieceConfigs?.[type])
      const home = bounded ? regionCells(plugin, bounded, rows, cols, playable) : null
      const where = home && home.length ? MIDDLE_OF(home, cols) : ordered[0]
      placements.push({ region: null, from: where })
    }

    const boards = []
    for (const { region, from } of placements) {
      // One piece on an otherwise empty board: the point is what the piece can
      // do, not what this position happens to allow.
      // A region placement stays in its region; an unplaced one may roam.
      const found = region ? probeFrom(type, from) : probeAnywhere(type, from)
      if (!found) continue
      const mine = found.moves
      boards.push({
        region,
        from: found.from !== undefined ? found.from : from,
        board: found.board,
        targets: [...new Set(mine.map(m => m.to))],
        promotes: mine.some(m => m.promotion),
      })
    }

    // A piece whose moves cannot be shown is left out rather than displayed as
    // one that cannot move. Reversi places rather than moves, and Go starts
    // with an empty board: neither has a legend of this kind to give.
    if (!boards.some(b => b.targets.length)) continue
    entries.push({ type, label: humanisePieceName(type), boards })
  }

  entries.sort((a, b) => b.boards.reduce((n, x) => n + x.targets.length, 0)
    - a.boards.reduce((n, x) => n + x.targets.length, 0))
  return entries
}
