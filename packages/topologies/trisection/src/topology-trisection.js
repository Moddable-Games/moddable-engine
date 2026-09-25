import { parseRankRuns } from '../../../core/index.js'
import { buildCells, seatPoint, vertexKey, outline, SECTORS } from './geometry.js'

// The hexagonal-trisection board (engine#26): a hexagon cut into three
// sectors, one per player, meeting at the centre. See geometry.js for the
// shape. This file is what makes it a board: which cells touch, which lines
// run straight, and where they fork.
//
// Two modes share the one geometry, because the two games that use it address
// it differently:
//
//   cells   pieces stand in the quadrilaterals, as in chess. Yalta Chess.
//   points  pieces stand where the lines cross, as in xiangqi. San-kwo-k'i.
//
// A cell is named by its sector, its file and its rank, each as its owner
// reads them: `Ae2` is the e2 of the first seat, `Bh1` the far-right corner of
// the second seat's back rank. The first seat's `e2` and the second's are
// different squares, which is the point of naming the sector.
//
// Movement is traced, not computed. Every cell is a quadrilateral wound the
// same way, so "straight on" out of a cell is always the edge opposite the
// one a line came in by, and "diagonally on" is the corner opposite. That
// holds everywhere on the board, including across the lines where one seat's
// half meets another's and the files turn to meet each other.
//
// The one place it forks is the centre. Six cells meet there instead of four,
// so a diagonal line arriving at the centre has two cells to go on to rather
// than one. Those are the two that keep the colour: two steps round the
// centre either way. Yalta's rule is exactly that - "the pawns, bishops and
// queens have a choice of path when they are passing the center" - and a
// Rook, whose lines cross edges rather than corners, never has a choice.

export const schema = {
  type: 'hexagonal-trisection',
  required: [],
}

const SEAT_LETTERS = 'ABC'
const FILE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

// Direction [dr, dc] in a cell's own frame to the edge a straight line leaves
// by, or the corner a diagonal leaves by. Rank up is toward the centre, file
// up is toward the cell owner's right.
const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const DIRECTION_CATEGORIES = {
  orthogonal: ORTHOGONAL,
  diagonal: DIAGONAL,
  all: [...ORTHOGONAL, ...DIAGONAL],
}

function edgeFor([dr, dc]) {
  if (dr === 1 && dc === 0) return 2
  if (dr === -1 && dc === 0) return 0
  if (dr === 0 && dc === 1) return 1
  if (dr === 0 && dc === -1) return 3
  return -1
}

function cornerFor([dr, dc]) {
  if (dr === 1 && dc === 1) return 2
  if (dr === 1 && dc === -1) return 3
  if (dr === -1 && dc === 1) return 1
  if (dr === -1 && dc === -1) return 0
  return -1
}

// Which mode a declaration asks for. A board inherits its family's topology
// keys under its own `type`, so San-kwo-k'i arrives carrying xiangqi's
// `layout: intersections` - which is the right answer: its pieces stand on
// points. `mode` says so outright where a board wants to.
export function trisectionMode(config = {}) {
  if (config.mode === 'cells' || config.mode === 'points') return config.mode
  return config.layout === 'intersections' ? 'points' : 'cells'
}

// The divisions along each edge of a sector's quadrilaterals. Four for cells
// is the one board this shape is known to be played on: Yalta's 96. A point
// board has no such default, because the only one in the corpus is
// San-kwo-k'i's and its line layout is not established - the sources show a
// nine-point back row and a centre whose lines "are not straight throughout",
// and do not say how many ranks lie between (engine#26). Drawing one anyway
// would be a board that looks right and plays wrong.
export function trisectionSize(config = {}) {
  if (config.size) return config.size
  return trisectionMode(config) === 'cells' ? 4 : null
}

export function createTrisectionTopology(config = {}) {
  const mode = trisectionMode(config)
  const size = trisectionSize(config)
  if (!size) {
    throw new Error(
      'A point-addressed hexagonal-trisection board needs its `size` declared: ' +
      'the number of divisions along each edge of a sector. No default is assumed (engine#26).'
    )
  }
  return mode === 'points' ? createPointTopology(size) : createCellTopology(size)
}

// ─── Cells ───────────────────────────────────────────────────────────────

export function cellKey(seat, file, rank) {
  return `${SEAT_LETTERS[seat]}${FILE_LETTERS[file]}${rank + 1}`
}

function createCellTopology(size) {
  const cells = buildCells(size)
  const keys = cells.map(c => cellKey(c.seat, c.file, c.rank))
  const indexOf = new Map(keys.map((k, i) => [k, i]))

  // Across each edge: the cell on the other side, and which of its edges it is.
  const across = cells.map(() => [null, null, null, null])
  const byEdge = new Map()
  cells.forEach((cell, i) => {
    for (let e = 0; e < 4; e++) {
      const a = cell.corners[e], b = cell.corners[(e + 1) % 4]
      const id = a < b ? `${a}|${b}` : `${b}|${a}`
      if (!byEdge.has(id)) byEdge.set(id, [])
      byEdge.get(id).push({ cell: i, edge: e })
    }
  })
  for (const sides of byEdge.values()) {
    if (sides.length !== 2) continue
    const [p, q] = sides
    across[p.cell][p.edge] = q
    across[q.cell][q.edge] = p
  }

  // Through each corner: the cells diagonally beyond it. Around a vertex the
  // cells form a ring joined edge to edge, and the diagonal neighbour is the
  // one two steps round - opposite, where four cells meet. Where six meet,
  // at the centre, two steps round each way are two different cells.
  function cornerOf(cellIdx, vertex) {
    return cells[cellIdx].corners.indexOf(vertex)
  }
  const diagonal = cells.map((cell, i) => cell.corners.map((vertex, k) => {
    const near = new Set()
    const far = new Map()
    for (const e of [k, (k + 3) % 4]) {
      const n = across[i][e]
      if (!n) continue
      near.add(n.cell)
      const m = cornerOf(n.cell, vertex)
      const other = n.edge === m ? (m + 3) % 4 : m
      const d = across[n.cell][other]
      if (d && d.cell !== i) far.set(d.cell, { cell: d.cell, corner: cornerOf(d.cell, vertex) })
    }
    for (const n of near) far.delete(n)
    return [...far.values()]
  }))

  // Light and dark, as a chessboard is coloured: every edge joins two colours.
  // The ring at the centre has six cells, an even number, so it can be.
  // The first seat's a1 is dark, as it is on a chessboard.
  const colour = new Array(cells.length).fill(-1)
  colour[0] = 0
  const queue = [0]
  while (queue.length) {
    const i = queue.shift()
    for (const n of across[i]) {
      if (!n || colour[n.cell] !== -1) continue
      colour[n.cell] = 1 - colour[i]
      queue.push(n.cell)
    }
  }

  const at = (key) => indexOf.get(key)

  // A straight line: out of the far edge of every cell it enters.
  function orthogonalRay(start, edge, limit) {
    const out = []
    let i = start, e = edge
    while (out.length < limit) {
      const next = across[i][e]
      if (!next) break
      out.push(keys[next.cell])
      i = next.cell
      e = (next.edge + 2) % 4
    }
    return out
  }

  // A diagonal line: out of the far corner of every cell it enters. At the
  // centre it forks, and each branch comes back as a ray of its own sharing
  // the steps before the fork, which is why this board says its rays may meet.
  function diagonalRays(start, corner, limit) {
    const rays = []
    const walk = (i, k, path) => {
      const onward = path.length < limit ? diagonal[i][k] : []
      if (!onward.length) { rays.push(path); return }
      for (const t of onward) walk(t.cell, (t.corner + 2) % 4, [...path, keys[t.cell]])
    }
    walk(start, corner, [])
    return rays
  }

  function directionsOf(input) {
    if (typeof input === 'string') return DIRECTION_CATEGORIES[input] || []
    return input || DIRECTION_CATEGORIES.all
  }

  function rays(from, dirs, maxSteps) {
    const i = at(from)
    if (i === undefined) return []
    const limit = maxSteps || cells.length
    const out = []
    for (const dir of directionsOf(dirs)) {
      const edge = edgeFor(dir)
      if (edge >= 0) { out.push(orthogonalRay(i, edge, limit)); continue }
      const corner = cornerFor(dir)
      if (corner >= 0) out.push(...diagonalRays(i, corner, limit))
    }
    return out
  }

  // A leap is a walk: so many steps along the ranks and so many across the
  // files, carrying the direction with it as the lines turn. Where the two
  // orders of the walk end on different cells - only ever near the centre -
  // both are targets. On an ordinary stretch of board they agree, and a
  // Knight's leap is the cell it would be on a chessboard.
  function walk(i, steps) {
    let cell = i, rot = 0
    for (const d of steps) {
      const next = across[cell][(d + rot) % 4]
      if (!next) return null
      cell = next.cell
      rot = (((next.edge + 2) - d) % 4 + 4) % 4
    }
    return cell
  }

  function leapTargets(from, offsets) {
    const i = at(from)
    if (i === undefined) return []
    const list = typeof offsets === 'string' ? (DIRECTION_CATEGORIES[offsets] || []) : (offsets || [])
    const found = new Set()
    for (const offset of list) {
      if (!Array.isArray(offset)) continue
      const [dr, dc] = offset
      const along = Array(Math.abs(dr)).fill(dr > 0 ? 2 : 0)
      const acrossSteps = Array(Math.abs(dc)).fill(dc > 0 ? 1 : 3)
      for (const steps of [[...along, ...acrossSteps], [...acrossSteps, ...along]]) {
        const end = walk(i, steps)
        if (end !== null && end !== i) found.add(keys[end])
      }
    }
    return [...found]
  }

  // A pawn does not move in a fixed direction on this board. In its own
  // sector forward is toward the centre; once across, it is away from it,
  // toward the back rank it is racing for. So a pawn's direction names the
  // seat it belongs to, and the cell it stands on decides the rest:
  //
  //   { pawn: seat }                         one step forward
  //   { pawn: seat, capture: -1|1, branch }  a forward diagonal, left or right;
  //                                          `branch` picks between the two
  //                                          cells beyond the centre
  function pawnForwardEdge(i, seat) {
    return cells[i].seat === seat ? 2 : 0
  }

  function pawnCaptureCorner(i, seat, side) {
    if (cells[i].seat === seat) return side < 0 ? 3 : 2
    return side < 0 ? 1 : 0
  }

  function step(from, dir) {
    const i = at(from)
    if (i === undefined || !dir) return null
    if (typeof dir === 'object' && !Array.isArray(dir) && dir.pawn !== undefined) {
      if (!dir.capture) {
        const next = across[i][pawnForwardEdge(i, dir.pawn)]
        return next ? keys[next.cell] : null
      }
      const t = diagonal[i][pawnCaptureCorner(i, dir.pawn, dir.capture)][dir.branch || 0]
      return t ? keys[t.cell] : null
    }
    if (!Array.isArray(dir)) return null
    const edge = edgeFor(dir)
    if (edge >= 0) {
      const next = across[i][edge]
      return next ? keys[next.cell] : null
    }
    const corner = cornerFor(dir)
    if (corner >= 0) {
      const t = diagonal[i][corner][0]
      return t ? keys[t.cell] : null
    }
    return null
  }

  // What a seat's pawns need to know: their two directions, where they start
  // and where they promote. They start on their own second rank and promote on
  // any other seat's back rank, which is the far edge wherever they cross to.
  function pawnGeometry(seat) {
    const captures = []
    for (const side of [-1, 1]) {
      for (const branch of [0, 1]) captures.push({ pawn: seat, capture: side, branch })
    }
    return {
      forward: { pawn: seat },
      captures,
      startCells: keys.filter((_, i) => cells[i].seat === seat && cells[i].rank === 1),
      promotionCells: keys.filter((_, i) => cells[i].seat !== seat && cells[i].rank === 0),
    }
  }

  // A seat's back rank, from its a-file to its last file.
  function backRank(seat) {
    return keys.filter((_, i) => cells[i].seat === seat && cells[i].rank === 0)
  }

  function parsePosition(notation, vocabulary) {
    return parseCellPosition(notation, vocabulary, { size, isValid: (k) => indexOf.has(k) })
  }

  function serializePosition(board, vocabulary) {
    return serializeKeyed(board, keys, vocabulary)
  }

  return {
    type: 'hexagonal-trisection',
    mode: 'cells',
    size,
    seats: SECTORS,
    raysMayMeet: true,
    isValid: (key) => indexOf.has(key),
    getAllCells: () => keys.slice(),
    getCellCount: () => keys.length,
    neighbours(key) {
      const i = at(key)
      if (i === undefined) return []
      return across[i].filter(Boolean).map(n => keys[n.cell])
    },
    seatOf: (key) => { const i = at(key); return i === undefined ? -1 : cells[i].seat },
    fileOf: (key) => { const i = at(key); return i === undefined ? -1 : cells[i].file },
    rankOf: (key) => { const i = at(key); return i === undefined ? -1 : cells[i].rank },
    colourOf: (key) => { const i = at(key); return i === undefined ? -1 : colour[i] },
    getDirections: (category) => DIRECTION_CATEGORIES[category] || [],
    rays,
    leapTargets,
    step,
    pawnGeometry,
    backRank,
    parsePosition,
    serializePosition,
    toJSON: (key) => key,
    fromJSON: (key) => key,
    // Everything a renderer needs, in the topology's own unit coordinates:
    // a hexagon of circumradius 1 with y pointing up.
    geometry() {
      return {
        cells: cells.map((c, i) => ({ key: keys[i], points: c.points, centre: c.centre, colour: colour[i], seat: c.seat })),
        ...outline(),
      }
    },
  }
}

// ─── Points ──────────────────────────────────────────────────────────────

// The same lines, with the pieces on their crossings. A point on a line where
// two sectors meet belongs to both; it takes its name from the earlier seat.
// The centre, which belongs to all three, is `O`.
function createPointTopology(size) {
  const byVertex = new Map()
  const names = []
  const where = []
  for (let seat = 0; seat < SECTORS; seat++) {
    for (let rank = 0; rank <= size; rank++) {
      for (let file = 0; file <= 2 * size; file++) {
        const p = seatPoint(size, seat, file, rank)
        const v = vertexKey(p)
        if (byVertex.has(v)) continue
        const name = Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9
          ? 'O'
          : `${SEAT_LETTERS[seat]}${FILE_LETTERS[file]}${rank + 1}`
        byVertex.set(v, names.length)
        names.push(name)
        where.push({ seat, file, rank, point: p })
      }
    }
  }
  const indexOf = new Map(names.map((n, i) => [n, i]))

  // Lines are the edges of the cells.
  const lines = names.map(() => new Set())
  for (const cell of buildCells(size)) {
    for (let e = 0; e < 4; e++) {
      const a = byVertex.get(cell.corners[e]), b = byVertex.get(cell.corners[(e + 1) % 4])
      lines[a].add(b)
      lines[b].add(a)
    }
  }
  const angleTo = (a, b) => Math.atan2(where[b].point.y - where[a].point.y, where[b].point.x - where[a].point.x)

  // Straight on through a point is the line leaving it most nearly opposite
  // the one arriving. Where lines cross four ways that is the obvious one; at
  // the centre six lines meet and the opposite one is still straight.
  function straightOn(from, at_) {
    const heading = angleTo(from, at_)
    let best = null, bestTurn = Infinity
    for (const next of lines[at_]) {
      if (next === from) continue
      let turn = Math.abs(angleTo(at_, next) - heading)
      if (turn > Math.PI) turn = 2 * Math.PI - turn
      if (turn < bestTurn) { bestTurn = turn; best = next }
    }
    return bestTurn < Math.PI / 4 ? best : null
  }

  function rays(from, dirs, maxSteps) {
    const i = indexOf.get(from)
    if (i === undefined) return []
    const limit = maxSteps || names.length
    const out = []
    for (const first of lines[i]) {
      const ray = [names[first]]
      let prev = i, cur = first
      while (ray.length < limit) {
        const next = straightOn(prev, cur)
        if (next === null) break
        ray.push(names[next])
        prev = cur
        cur = next
      }
      out.push(ray)
    }
    return out
  }

  return {
    type: 'hexagonal-trisection',
    mode: 'points',
    size,
    seats: SECTORS,
    isValid: (key) => indexOf.has(key),
    getAllCells: () => names.slice(),
    getCellCount: () => names.length,
    neighbours: (key) => {
      const i = indexOf.get(key)
      return i === undefined ? [] : [...lines[i]].map(n => names[n])
    },
    rays,
    leapTargets: () => [],
    parsePosition: (notation, vocabulary) => parseCellPosition(notation, vocabulary, { isValid: (k) => indexOf.has(k) }),
    serializePosition: (board, vocabulary) => serializeKeyed(board, names, vocabulary),
    toJSON: (key) => key,
    fromJSON: (key) => key,
    geometry() {
      const segments = []
      lines.forEach((set, a) => {
        for (const b of set) if (a < b) segments.push([where[a].point, where[b].point])
      })
      return {
        points: names.map((key, i) => ({ key, centre: where[i].point, seat: where[i].seat })),
        segments,
        ...outline(),
      }
    },
  }
}

// ─── Positions ───────────────────────────────────────────────────────────

function symbolMap(vocabulary) {
  const from = new Map()
  const to = new Map()
  for (const [type, def] of Object.entries(vocabulary || {})) {
    for (const [owner, symbol] of Object.entries(def?.symbols || {})) {
      if (!symbol) continue
      const seat = /^\d+$/.test(owner) ? Number(owner) : owner
      from.set(String(symbol), { type, owner: seat })
      to.set(`${type}.${seat}`, String(symbol))
    }
  }
  return { from, to }
}

// Two ways to write a position down.
//
// Keyed, as the play page writes a live board back out:
//
//     Ae1:rK,Ad1:rQ,Be1:gK
//
// Or by ranks, which is shorter to author. One block per seat in seat order,
// each written the way that seat would write the FEN of its own half: its
// front rank (nearest the centre) first and its back rank last, files from its
// left. Symbols longer than one character go in brackets.
//
//     4/4/[rP][rP]../[rR][rN]../...     three blocks of `size` ranks
export function parseCellPosition(notation, vocabulary, { size, isValid }) {
  const { from } = symbolMap(vocabulary)
  const board = {}
  for (const [key, symbol] of Object.entries(readTrisectionSymbols(notation, size) || {})) {
    const piece = from.get(symbol)
    if (piece && isValid(key)) board[key] = { ...piece }
  }
  return board
}

// The same position, as the symbol standing on each cell and nothing more:
// what a board editor places. Null when the text is not a position in either
// form, or a block of ranks is too wide for the board.
export function readTrisectionSymbols(notation, size) {
  const out = {}
  if (!notation) return out
  const text = String(notation).trim().split(' ')[0]
  if (text.includes(':')) {
    for (const entry of text.split(',')) {
      const at = entry.lastIndexOf(':')
      if (at < 0) return null
      const key = entry.slice(0, at).trim()
      const symbol = entry.slice(at + 1).trim()
      if (!key || !symbol) return null
      out[key] = symbol
    }
    return out
  }
  if (!size) return null
  const ranks = text.split('/')
  if (ranks.length !== SECTORS * size) return null
  for (let seat = 0; seat < SECTORS; seat++) {
    for (let r = 0; r < size; r++) {
      const rank = size - 1 - r
      let file = 0
      for (const run of parseRankRuns(ranks[seat * size + r])) {
        if (run.skip !== undefined) { file += run.skip; continue }
        if (file >= 2 * size) return null
        out[cellKey(seat, file, rank)] = run.symbol
        file++
      }
      if (file > 2 * size) return null
    }
  }
  return out
}

function serializeKeyed(board, keys, vocabulary) {
  const { to } = symbolMap(vocabulary)
  const out = []
  for (const key of keys) {
    const cell = board?.[key]
    if (!cell) continue
    const symbol = to.get(`${cell.type}.${cell.owner}`)
    if (symbol) out.push(`${key}:${symbol}`)
  }
  return out.join(',')
}

// ─── Rendering ───────────────────────────────────────────────────────────

// The drawing program schema/produce-layout-trisection.js builds is already a
// list of elements; rendering it is reading the hit targets back off it.
export function renderTrisectionLayout(config = {}) {
  const elements = config.elements || []
  const cells = []
  for (const el of elements) {
    const key = el.attrs && el.attrs['data-sq']
    if (key !== undefined) cells.push({ id: key, element: el })
  }
  return { width: config.width || 0, height: config.height || 0, elements, cells, labels: [], defs: [] }
}
