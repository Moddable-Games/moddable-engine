import { parseRankRuns } from '../../../core/index.js'

// A board of triangles (engine#173). Sankaku Shogi is the corpus's only one:
// forty-four triangles, "in a diamond pattern with the four extreme corners
// removed", which its source draws as ranks of 3, 5, 7, 7, 7, 7, 5 and 3.
//
// The board is declared as a picture, one string per rank from the top, one
// character per file: `A` a triangle with its apex up, `V` one with its apex
// down, `.` no cell. Sankaku's is
//
//     ..AVA..      rank 8
//     .AVAVA.
//     AVAVAVA
//     VAVAVAV
//     AVAVAVA
//     VAVAVAV
//     .VAVAV.
//     ..VAV..      rank 1
//
// which is exactly the source's ASCII diagram, read cell by cell. A file is
// half a triangle wide, so neighbouring files interleave: the triangles of one
// rank alternate apex up and apex down, sharing their slanted sides.
//
// Two relations over the one tiling, because the source's pieces use both:
//
//   orthogonal  through a shared side. "Orthogonal movement is through the
//               above patterns of triangles" - three strips, one along the
//               ranks and one along each slant - "with each step being from
//               one cell to another which shares a complete side." A line is
//               a strip walked in one sense, so a cell has six orthogonal
//               directions over its three sides.
//   adjacent    "from one cell to another which connected either by side or
//               point": every cell sharing a corner, up to twelve.
//
// A strip crosses the two kinds of side that are not its own boundary, in
// turn: a strip along a rank crosses the two slants alternately, and a strip
// along a slant crosses the horizontal side and the other slant. So a
// direction is the strip and the side it leaves by first.

export const schema = {
  type: 'triangular',
  required: ['shape'],
}

const FILE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

// The three kinds of side, and the strip each pair of them makes.
const H = 'H', RISE = 'R', FALL = 'F'
const STRIPS = { rank: [RISE, FALL], rise: [H, FALL], fall: [H, RISE] }

// The six orthogonal directions, as a strip and the side it leaves by first.
const ORTHOGONAL = Object.entries(STRIPS).flatMap(([strip, [a, b]]) => [
  { strip, first: a, steps: 1 },
  { strip, first: b, steps: 1 },
])

function withSteps(dirs, steps) {
  return dirs.map(d => ({ ...d, steps }))
}

const DIRECTION_CATEGORIES = {
  orthogonal: ORTHOGONAL,
  'second-orthogonal': withSteps(ORTHOGONAL, 2),
  adjacent: [{ adjacent: true }],
}

function sideKind(a, b) {
  if (a.y === b.y) return H
  return (b.x - a.x) * (b.y - a.y) > 0 ? RISE : FALL
}

export function readTriangularShape(shape) {
  if (!Array.isArray(shape) || !shape.length) {
    throw new Error('A triangular board needs its `shape`: one string per rank, top rank first, of A (apex up), V (apex down) and . (no cell).')
  }
  const ranks = shape.length
  const files = Math.max(...shape.map(s => String(s).length))
  const cells = []
  shape.forEach((text, i) => {
    const rank = ranks - i
    let previous = null
    for (let file = 0; file < String(text).length; file++) {
      const ch = String(text)[file]
      if (ch === '.' || ch === ' ') { previous = null; continue }
      if (ch !== 'A' && ch !== 'V') throw new Error(`Triangular shape, rank ${rank}: "${ch}" is not A, V or .`)
      // Two triangles side by side on a rank point opposite ways; two the
      // same way cannot share a side and the board would come apart there.
      if (previous === ch) throw new Error(`Triangular shape, rank ${rank}: two ${ch} cells side by side at file ${FILE_LETTERS[file]}`)
      previous = ch
      cells.push({ file, rank, up: ch === 'A' })
    }
  })
  return { ranks, files, cells }
}

export function createTriangularTopology(config = {}) {
  const { ranks, files, cells } = readTriangularShape(config.shape)
  // A board that states its size is checked against its picture: Sankaku's
  // file says 44 twice, and the one per-rank count anyone wrote down from it
  // summed to 23.
  if (typeof config.cells === 'number' && config.cells !== cells.length) {
    throw new Error(`Triangular board declares ${config.cells} cells and its shape has ${cells.length}`)
  }

  const keys = cells.map(c => `${FILE_LETTERS[c.file]}${c.rank}`)
  const indexOf = new Map(keys.map((k, i) => [k, i]))

  // Corners in half-side units across and rank heights up. A cell on file f
  // spans f to f + 2, so the next file along shares its slanted side.
  const corners = cells.map(({ file: f, rank: r, up }) => (up
    ? [{ x: f, y: r - 1 }, { x: f + 2, y: r - 1 }, { x: f + 1, y: r }]
    : [{ x: f, y: r }, { x: f + 2, y: r }, { x: f + 1, y: r - 1 }]))
  const pointKey = (p) => `${p.x},${p.y}`

  // Across each kind of side: the cell on the other side of it.
  const across = cells.map(() => ({}))
  const bySide = new Map()
  corners.forEach((pts, i) => {
    for (let k = 0; k < 3; k++) {
      const a = pts[k], b = pts[(k + 1) % 3]
      const id = [pointKey(a), pointKey(b)].sort().join('|')
      if (!bySide.has(id)) bySide.set(id, [])
      bySide.get(id).push({ cell: i, kind: sideKind(a, b) })
    }
  })
  for (const sides of bySide.values()) {
    if (sides.length !== 2) continue
    across[sides[0].cell][sides[0].kind] = sides[1].cell
    across[sides[1].cell][sides[1].kind] = sides[0].cell
  }

  // Every cell sharing a corner.
  const byPoint = new Map()
  corners.forEach((pts, i) => {
    for (const p of pts) {
      const id = pointKey(p)
      if (!byPoint.has(id)) byPoint.set(id, new Set())
      byPoint.get(id).add(i)
    }
  })
  const adjacent = cells.map((_, i) => {
    const out = new Set()
    for (const p of corners[i]) for (const j of byPoint.get(pointKey(p))) if (j !== i) out.add(j)
    return [...out]
  })

  const at = (key) => indexOf.get(key)

  // Along a strip: leave by `first`, then by the strip's other side, in turn.
  function walk(start, { strip, first }, limit) {
    const pair = STRIPS[strip]
    if (!pair || !pair.includes(first)) return []
    const out = []
    let cell = start
    let side = first
    while (out.length < limit) {
      const next = across[cell][side]
      if (next === undefined) break
      out.push(keys[next])
      cell = next
      side = side === pair[0] ? pair[1] : pair[0]
    }
    return out
  }

  function directionsOf(input) {
    if (typeof input === 'string') return DIRECTION_CATEGORIES[input] || []
    return input || ORTHOGONAL
  }

  function rays(from, dirs, maxSteps) {
    const i = at(from)
    if (i === undefined) return []
    const limit = maxSteps || cells.length
    return directionsOf(dirs).map(dir => (dir.adjacent
      ? adjacent[i].slice(0, limit).map(j => keys[j])
      : walk(i, dir, limit)))
  }

  function leapTargets(from, offsets) {
    const i = at(from)
    if (i === undefined) return []
    const found = new Set()
    for (const dir of directionsOf(offsets)) {
      if (!dir || typeof dir !== 'object') continue
      if (dir.adjacent) { for (const j of adjacent[i]) found.add(keys[j]); continue }
      const path = walk(i, dir, dir.steps || 1)
      if (path.length === (dir.steps || 1)) found.add(path[path.length - 1])
    }
    found.delete(from)
    return [...found]
  }

  function step(from, dir) {
    return leapTargets(from, [dir])[0] ?? null
  }

  function parsePosition(notation, vocabulary) {
    return parseTriangularPosition(notation, vocabulary, { ranks, isValid: (k) => indexOf.has(k) })
  }

  return {
    type: 'triangular',
    ranks,
    files,
    raysMayMeet: true,
    isValid: (key) => indexOf.has(key),
    getAllCells: () => keys.slice(),
    getCellCount: () => keys.length,
    // The cells a side away, or - asked for `adjacent` - a side or a corner.
    neighbours(key, relation = 'orthogonal') {
      const i = at(key)
      if (i === undefined) return []
      if (relation === 'adjacent') return adjacent[i].map(j => keys[j])
      return Object.values(across[i]).map(j => keys[j])
    },
    isUp: (key) => { const i = at(key); return i === undefined ? null : cells[i].up },
    getDirections: (category) => DIRECTION_CATEGORIES[category] || [],
    rays,
    leapTargets,
    step,
    parsePosition,
    toJSON: (key) => key,
    fromJSON: (key) => key,
    geometry() {
      return {
        ranks,
        files,
        cells: cells.map((c, i) => ({ key: keys[i], file: c.file, rank: c.rank, up: c.up, points: corners[i] })),
      }
    },
  }
}

// A position is written as a FEN is, rank by rank from the top, one entry per
// file - a file with no cell is simply never given a piece. Or keyed, as the
// play page writes a live board: `d1:E,c1:R`.
export function parseTriangularPosition(notation, vocabulary, { ranks, isValid }) {
  const from = new Map()
  for (const [type, def] of Object.entries(vocabulary || {})) {
    for (const [owner, symbol] of Object.entries(def?.symbols || {})) {
      if (symbol) from.set(String(symbol), { type, owner: /^\d+$/.test(owner) ? Number(owner) : owner })
    }
  }
  const board = {}
  for (const [key, symbol] of Object.entries(readTriangularSymbols(notation, ranks) || {})) {
    const piece = from.get(symbol)
    if (piece && isValid(key)) board[key] = { ...piece }
  }
  return board
}

// The same position as the symbol on each cell and nothing more: what a board
// editor places. Null when the text is neither form, or has the wrong number
// of ranks for the board.
export function readTriangularSymbols(notation, ranks) {
  const out = {}
  const text = String(notation || '').trim().split(' ')[0]
  if (!text) return out
  if (text.includes(':')) {
    for (const entry of text.split(',')) {
      const cut = entry.lastIndexOf(':')
      if (cut < 0) return null
      const key = entry.slice(0, cut).trim()
      const symbol = entry.slice(cut + 1).trim()
      if (!key || !symbol) return null
      out[key] = symbol
    }
    return out
  }
  const rows = text.split('/')
  if (ranks && rows.length !== ranks) return null
  rows.forEach((row, i) => {
    const rank = rows.length - i
    let file = 0
    for (const run of parseRankRuns(row)) {
      if (run.skip !== undefined) { file += run.skip; continue }
      out[`${FILE_LETTERS[file]}${rank}`] = run.symbol
      file++
    }
  })
  return out
}

// ─── Rendering ───────────────────────────────────────────────────────────

// schema/produce-layout-triangular.js builds the whole program; this hands it
// on in the shape every layout has, reading the hit targets back off it.
export function renderTriangularLayout(config = {}) {
  const elements = config.elements || []
  const cells = []
  for (const el of elements) {
    const key = el.attrs && el.attrs['data-sq']
    if (key !== undefined) cells.push({ id: key, element: el })
  }
  return { width: config.width || 0, height: config.height || 0, elements, cells, labels: config.labels || [], defs: [] }
}
