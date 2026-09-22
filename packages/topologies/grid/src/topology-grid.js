import { readPosition, parseRankRuns, fileLabel, fileIndex, intersectionLabel, splitCellId } from '../../../core/index.js'
export const schema = {
  type: 'grid',
  required: ['rows', 'cols'],
}

export function createGridTopology(config) {
  const { rows, cols, wrap = false, voids: voidList, blockers: blockerList, diagonals: diagonalRule = 'full', layers = 1, layerAdjacency = 'none', layerSeats = null } = config

  // A stack of boards is ONE board with a layer coordinate, not N boards.
  // `topology.grid` already takes an explicit cell list, the variants that need
  // this draw a single physical board, and one cell space keeps the move
  // notation and the AI's state key unchanged. Cell `i` is on layer
  // `i / (rows * cols)`, and every neighbour relation stays inside its own
  // plane - a piece never slides from one board to another. Crossing layers is
  // a rule, which is how Alice Chess describes it: you move on your board, then
  // the piece "transfers" to the matching square on the other (engine#159).
  //
  // That guarantee belongs to the variant, not to the grid, because a stack of
  // boards can be either of two things. Alice's boards never touch; in
  // Raumschach the stack IS the board, and a Rook slides straight up it as
  // ordinary geometry. `layerAdjacency` says which:
  //
  //   none      each plane is its own board. A direction is [dr, dc] and a
  //             move never leaves the plane it started on (Alice)
  //   stacked   the planes are one volume. A direction may carry a third
  //             component, [dr, dc, dl], and `dl` moves between planes
  //             (Raumschach, Gygax)
  //
  // A direction with a non-zero `dl` goes nowhere on a board whose planes do
  // not connect, so an Alice position can never be reached by a 3D move.
  //
  // `layerSeats` says who sits at each board when the boards are played by
  // different seats. Tandem Chess is two games of chess in one: board A is
  // seats 0 and 1, board B seats 2 and 3, and each board is still written as
  // an ordinary FEN, so its White and Black become that board's seats:
  //
  //     layerSeats: [[0, 1], [2, 3]]
  const plane = rows * cols
  const layerOf = (i) => (i / plane) | 0
  const stacked = layerAdjacency === 'stacked' && layers > 1
  if (layerAdjacency !== 'none' && layerAdjacency !== 'stacked') {
    throw new Error(`Unknown layerAdjacency "${layerAdjacency}". Expected "none" or "stacked".`)
  }

  // Which plane a move lands on, or -1 when it leaves the stack. A move that
  // changes plane on a board whose planes do not connect leaves it too.
  function targetLayer(fromLayer, dl) {
    if (!dl) return fromLayer
    if (!stacked) return -1
    const nl = fromLayer + dl
    return nl >= 0 && nl < layers ? nl : -1
  }

  const _voids = voidList ? new Set(voidList.map(v => Array.isArray(v) ? v[0] * cols + v[1] : v)) : null
  const _blockers = blockerList ? new Set(blockerList.map(v => Array.isArray(v) ? v[0] * cols + v[1] : v)) : null

  function toIndex(r, c) {
    return r * cols + c
  }

  function toRC(index) {
    return [Math.floor(index / cols), index % cols]
  }

  // The half-twist belongs to the RANK seam, not the file wrap.
  //
  // Moebius Chess joins rank 11 to rank 12 mirrored across the files - "a11
  // would join h12, b11 would join g12" - so crossing that seam maps column c
  // to cols-1-c. Both variants say so in their own frontmatter, and the engine
  // did the opposite: it twisted the file wrap and gave mobius no rank wrap at
  // all, so the feature both variants are named for was absent (engine#159).
  //
  // The two differ in what happens to the OTHER pair of edges, and that is the
  // definition of the two surfaces rather than a choice:
  //
  //   mobius        one pair joined with a twist; the other pair is a genuine
  //                 boundary, because a Moebius strip has an edge
  //   klein-bottle  both pairs joined, one plainly and one with the twist
  //
  // So mobius wraps ranks only and klein-bottle wraps both.
  const wrapR = wrap === true || wrap === 'torus' || wrap === 'ranks' || wrap === 'mobius' || wrap === 'klein-bottle' || wrap === 'spherical'
  const wrapC = wrap === true || wrap === 'torus' || wrap === 'files' || wrap === 'cylinder' || wrap === 'klein-bottle' || wrap === 'spherical'

  function wrapCoords(r, c) {
    if (!wrap) return [r, c]
    let wr = r, wc = c
    if (wrapC && (wc < 0 || wc >= cols)) {
      wc = ((wc % cols) + cols) % cols
    }
    if (spherical && (wr < 0 || wr >= rows)) {
      // A pole is a reflection, not a wrap: one step past the end rank is the
      // end rank again, half way round. See `poleStep`.
      wr = wr < 0 ? -1 - wr : 2 * rows - 1 - wr
      wc = (wc + half) % cols
    } else if (wrapR && (wr < 0 || wr >= rows)) {
      wr = ((wr % rows) + rows) % rows
      if (wrap === 'mobius' || wrap === 'klein-bottle') wc = cols - 1 - wc
    }
    return [wr, wc]
  }

  // Spherical Chess treats the files as meridians meeting at two poles, and a
  // pole is a different join from any wrap. "When a Rook passes over the pole,
  // it naturally goes to a space in the same rank that is four spaces away"
  // (chessvariants.com/boardrules.dir/spherical.html) - the same rank, not the
  // far edge, and heading back the way it came: Ra3-a2-a1-e1-e2-e3.
  //
  // So crossing a pole changes the DIRECTION of travel as well as the cell,
  // which no coordinate map can express - `ray` advances by a fixed step. This
  // is the one step every walker on a spherical board takes. A diagonal crosses
  // the same way, "directly through the pole in a vertical direction and then
  // completely reverses direction": Bg3-f2-e1-a1-b2-c3.
  const spherical = wrap === 'spherical'
  const half = cols >> 1

  function poleStep(r, c, dr, dc) {
    const nr = r + dr
    if (nr >= 0 && nr < rows) return [nr, ((c + dc) % cols + cols) % cols, dr, dc]
    return [r, (c + half) % cols, -dr, -dc]
  }

  // A leap on a sphere is a walk: its rank steps first, crossing a pole if it
  // meets one, then its file steps. Crossing turns the walker round, so the
  // file steps after it run the other way. Yapsan's Knight "moves radially
  // across the pole when making a radial move; its move is then completed by a
  // circumpolar move", and has eight moves from every square.
  //
  // A single step is the walker's own step, so a King's diagonal over a pole
  // lands where a Bishop's first step does.
  function poleLeap(r, c, dr, dc) {
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) {
      const [nr, nc] = poleStep(r, c, dr, dc)
      return [nr, nc]
    }
    let cr = r, cc = c, sr = Math.sign(dr), turned = false
    for (let i = 0; i < Math.abs(dr); i++) {
      const [nr, nc, ndr] = poleStep(cr, cc, sr, 0)
      if (ndr !== sr) turned = !turned
      cr = nr; cc = nc; sr = ndr
    }
    const fileDir = Math.sign(dc) * (turned ? -1 : 1)
    for (let i = 0; i < Math.abs(dc); i++) [cr, cc] = poleStep(cr, cc, 0, fileDir)
    return [cr, cc]
  }

  function isVoid(index) {
    return _voids !== null && _voids.has(index)
  }

  function isBlocker(index) {
    return _blockers !== null && _blockers.has(index)
  }

  function isValid(coord) {
    if (typeof coord === 'number') {
      if (coord < 0 || coord >= rows * cols) return false
      return !isVoid(coord)
    }
    const [r, c] = coord
    if (wrapR && wrapC) return !isVoid(toIndex(r, c))
    if (wrapR) return c >= 0 && c < cols && !isVoid(toIndex(r, c))
    if (wrapC) return r >= 0 && r < rows && !isVoid(toIndex(r, c))
    return r >= 0 && r < rows && c >= 0 && c < cols && !isVoid(toIndex(r, c))
  }

  // These four were rebuilt on every call, which for a Go search means a fresh
  // pair of arrays per direction per cell per rollout ply. A board's directions
  // are a property of the grid, not of the cell being asked about.
  const ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]]

  // Not every board draws a diagonal at every point, and a piece may only move
  // along a line that is drawn. On an Alquerque board the diagonals run
  // corner to corner and midpoint to midpoint, which leaves the points with an
  // even coordinate sum carrying all four and the rest carrying none - the
  // 8-neighbour/4-neighbour alternation that Alquerque and Fanorona are built
  // on. `diagonals: 'full'` is every other grid board and is the default.
  function diagonalExists(r, c) {
    if (diagonalRule === 'none') return false
    if (diagonalRule === 'alternating') return (r + c) % 2 === 0
    return true
  }

  function isDiagonal(dr, dc) {
    return dr !== 0 && dc !== 0
  }

  function adjacentIn(dirs, r, c) {
    const result = []
    for (let i = 0; i < dirs.length; i++) {
      if (isDiagonal(dirs[i][0], dirs[i][1]) && !diagonalExists(r, c)) continue
      let nr = r + dirs[i][0], nc = c + dirs[i][1]
      if (wrap) {
        const wrapped = wrapCoords(nr, nc)
        nr = wrapped[0]
        nc = wrapped[1]
      }
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const idx = nr * cols + nc
        if (!isVoid(idx)) result.push(idx)
      }
    }
    return result
  }

  // Which cells touch which never changes for a given board: no move adds a
  // cell, removes one, or moves one. Go's flood fills walk this millions of
  // times in a single search and it was recomputed every time. Cached per
  // index; a coordinate pair still computes, since only the index form is
  // hot and callers treat the result as read-only.
  const _orthoCache = []
  const _diagCache = []

  function neighbours(coord) {
    if (typeof coord === 'number') {
      const cached = _orthoCache[coord]
      if (cached !== undefined) return cached
      const computed = adjacentIn(ORTHOGONAL, (coord / cols) | 0, coord % cols)
      _orthoCache[coord] = computed
      return computed
    }
    return adjacentIn(ORTHOGONAL, coord[0], coord[1])
  }

  function diagonalNeighbours(coord) {
    if (typeof coord === 'number') {
      const cached = _diagCache[coord]
      if (cached !== undefined) return cached
      const computed = adjacentIn(DIAGONAL, (coord / cols) | 0, coord % cols)
      _diagCache[coord] = computed
      return computed
    }
    return adjacentIn(DIAGONAL, coord[0], coord[1])
  }

  function allNeighbours(coord) {
    return [...neighbours(coord), ...diagonalNeighbours(coord)]
  }

  function distance(a, b) {
    const [r1, c1] = typeof a === 'number' ? toRC(a) : a
    const [r2, c2] = typeof b === 'number' ? toRC(b) : b
    return Math.abs(r1 - r2) + Math.abs(c1 - c2)
  }

  function chebyshev(a, b) {
    const [r1, c1] = typeof a === 'number' ? toRC(a) : a
    const [r2, c2] = typeof b === 'number' ? toRC(b) : b
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
  }

  function toJSON(coord) {
    return String(coord)
  }

  function fromJSON(str) {
    return parseInt(str, 10)
  }

  function ray(from, dr, dc, maxSteps, dl = 0) {
    // `toRC` allocates a pair for every call, and a slider asks for one ray per
    // direction per piece per node of the search.
    const isIdx = typeof from === 'number'
    const fromLayer = isIdx ? layerOf(from) : 0
    const local = isIdx ? from - fromLayer * plane : 0
    const r = isIdx ? (local / cols) | 0 : from[0]
    const c = isIdx ? local % cols : from[1]
    const origin = fromLayer * plane + toIndex(r, c)
    const result = []
    // A ray runs along a line, so it goes nowhere at all from a point the board
    // draws no such line through.
    if (isDiagonal(dr, dc) && !diagonalExists(r, c)) return result
    if (dl && !stacked) return result
    // A line on a joined board can be longer than any side: a great circle
    // through a file of an 8x8 sphere holds 16 cells, and a line across a
    // twisted seam comes back mirrored. It runs until it returns to where it
    // started, so the cap only has to be large enough never to cut one short.
    const limit = maxSteps || (wrap ? rows * cols : Math.max(rows, cols, stacked ? layers : 0))
    if (spherical) {
      let cr = r, cc = c, sr = dr, sc = dc
      for (let steps = 0; steps < limit; steps++) {
        [cr, cc, sr, sc] = poleStep(cr, cc, sr, sc)
        const idx = fromLayer * plane + toIndex(cr, cc)
        if (idx === origin) break
        if (isVoid(idx - fromLayer * plane)) break
        result.push(idx)
      }
      return result
    }
    let nr = r + dr, nc = c + dc, nl = fromLayer + dl
    let steps = 0
    while (steps < limit) {
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
      if (nl < 0 || nl >= layers) break
      const idx = nl * plane + toIndex(nr, nc)
      if (idx === origin) break
      if (isVoid(idx - nl * plane)) break
      result.push(idx)
      nr += dr
      nc += dc
      nl += dl
      steps++
    }
    return result
  }

  function onBoard(r, c) {
    if (wrapR && wrapC) return !isVoid(toIndex(r, c))
    if (wrapR) return c >= 0 && c < cols && !isVoid(toIndex(r, c))
    if (wrapC) return r >= 0 && r < rows && !isVoid(toIndex(r, c))
    return r >= 0 && r < rows && c >= 0 && c < cols && !isVoid(toIndex(r, c))
  }

  function rays(from, directions, maxSteps) {
    const resolved = typeof directions === 'string' ? getDirections(directions) : directions
    return resolved.map(([dr, dc, dl]) => ray(from, dr, dc, maxSteps, dl))
  }

  function leapTargets(from, offsets) {
    const resolved = typeof offsets === 'string' ? getDirections(offsets) : offsets
    const fromLayer = layerOf(from)
    const local = from - fromLayer * plane
    const r = (local / cols) | 0, c = local % cols
    const targets = []
    for (let i = 0; i < resolved.length; i++) {
      const nl = targetLayer(fromLayer, resolved[i][2])
      if (nl < 0) continue
      if (spherical) {
        const [lr, lc] = poleLeap(r, c, resolved[i][0], resolved[i][1])
        const idx = nl * plane + toIndex(lr, lc)
        // Two offsets can meet at one cell across a pole; a target is a cell,
        // and the origin is not one.
        if (idx !== from && !isVoid(idx - nl * plane) && !targets.includes(idx)) targets.push(idx)
        continue
      }
      let nr = r + resolved[i][0], nc = c + resolved[i][1]
      if (wrap) {
        const wrapped = wrapCoords(nr, nc)
        nr = wrapped[0]
        nc = wrapped[1]
      }
      if (onBoard(nr, nc)) targets.push(nl * plane + toIndex(nr, nc))
    }
    return targets
  }

  function jumpPairs(from, directionInput) {
    const directions = typeof directionInput === 'string' ? getDirections(directionInput) : directionInput
    const [r, c] = toRC(from)
    const pairs = []
    for (const [dr, dc] of directions) {
      let nr = r + dr, nc = c + dc
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (!onBoard(nr, nc)) continue
      const over = toIndex(nr, nc)
      let lr = nr + dr, lc = nc + dc
      if (wrap) [lr, lc] = wrapCoords(lr, lc)
      if (!onBoard(lr, lc)) continue
      pairs.push({ over, landing: toIndex(lr, lc) })
    }
    return pairs
  }

  function adjacentPairs(from, directions) {
    const [r, c] = toRC(from)
    const pairs = []
    for (const [dr, dc] of directions) {
      let nr = r + dr, nc = c + dc
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (!onBoard(nr, nc)) continue
      const adjacent = toIndex(nr, nc)
      let fr = nr + dr, fc = nc + dc
      if (wrap) [fr, fc] = wrapCoords(fr, fc)
      if (!onBoard(fr, fc)) continue
      pairs.push({ adjacent, far: toIndex(fr, fc) })
    }
    return pairs
  }

  // On a stacked board the named directions mean what they mean in a volume:
  // orthogonal crosses a face of the cell (6), diagonal an edge (12),
  // triagonal a corner (8), and all is every neighbour (26). A 2D Rook, Bishop,
  // Queen and King asked for 'orthogonal', 'diagonal' and 'all' already, so on a
  // stacked board they are the 3D pieces with no declaration of their own.
  //
  // The Knight's leap is the one named offset set that changes with the number
  // of axes: every signed ordering of (1, 2) in two dimensions, of (0, 1, 2) in
  // three. Only a stacked board declares it; a flat one leaves it to the
  // piece's own table, which is the same eight offsets in the order the rest of
  // the engine was built against.
  const DIRECTIONS = stacked ? volumeDirections() : {
    orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    all: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
  }

  function volumeDirections() {
    const byAxes = { 1: [], 2: [], 3: [] }
    for (const dr of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        for (const dl of [-1, 0, 1]) {
          const moved = (dr !== 0) + (dc !== 0) + (dl !== 0)
          if (moved) byAxes[moved].push([dr, dc, dl])
        }
      }
    }
    const knight = []
    const seen = new Set()
    for (const [a, b, c] of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
      for (const sa of a ? [-1, 1] : [1]) {
        for (const sb of b ? [-1, 1] : [1]) {
          for (const sc of c ? [-1, 1] : [1]) {
            const offset = [a * sa, b * sb, c * sc]
            const key = offset.join(',')
            if (!seen.has(key)) { seen.add(key); knight.push(offset) }
          }
        }
      }
    }
    return {
      orthogonal: byAxes[1],
      diagonal: byAxes[2],
      triagonal: byAxes[3],
      all: [...byAxes[1], ...byAxes[2], ...byAxes[3]],
      knight,
    }
  }

  function getDirections(category) {
    return DIRECTIONS[category] || []
  }

  function getLayout(opts = {}) {
    const {
      tileSize = 56,
      alternating = true,
      mode = 'tiles',
      spacing = 20,
      starPoints = [],
      diagonals = diagonalRule === 'full' ? 'none' : diagonalRule,
      riverAfterRow = null,
      riverHeight = 20,
      palaces = [],
    } = opts

    if (mode === 'intersections') {
      return intersectionLayout({ spacing, starPoints, diagonals, riverAfterRow, riverHeight, palaces })
    }

    return {
      getDimensions() {
        return { width: cols * tileSize, height: rows * tileSize }
      },
      getCells() {
        const cells = []
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cellType = alternating ? ((r + c) % 2 === 0 ? 'light' : 'dark') : 'uniform'
            const x = c * tileSize
            const y = r * tileSize
            cells.push({
              key: toIndex(r, c),
              center: { x: x + tileSize / 2, y: y + tileSize / 2 },
              cellType,
              element: 'rect',
              attrs: { x, y, width: tileSize, height: tileSize },
            })
          }
        }
        return cells
      },
      defaults: {
        cells: { light: { fill: '#f0d9b5' }, dark: { fill: '#b58863' }, uniform: { fill: '#dcb35c' } },
        lines: { stroke: '#333', 'stroke-width': 1.5 },
      },
      getLabels() {
        const labels = []
        for (let c = 0; c < cols; c++) {
          labels.push({ x: c * tileSize + tileSize / 2, y: rows * tileSize + 12, text: fileLabel(c), anchor: 'middle' })
        }
        for (let r = 0; r < rows; r++) {
          labels.push({ x: -10, y: r * tileSize + tileSize / 2, text: String(rows - r), anchor: 'middle', baseline: 'central' })
        }
        return labels
      },
    }
  }

  function intersectionLayout({ spacing, starPoints, diagonals, riverAfterRow, riverHeight, palaces }) {
    const gap = riverAfterRow !== null ? riverHeight : 0
    const gridW = (cols - 1) * spacing
    const gridH = (rows - 1) * spacing + gap

    function posY(r) {
      if (riverAfterRow !== null && r > riverAfterRow) {
        return r * spacing + gap
      }
      return r * spacing
    }

    return {
      getDimensions() {
        return { width: gridW, height: gridH }
      },
      getCells() {
        const cells = []
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * spacing
            const y = posY(r)
            cells.push({
              key: toIndex(r, c),
              center: { x, y },
              cellType: 'intersection',
              element: 'circle',
              attrs: { cx: x, cy: y, r: 0 },
            })
          }
        }
        return cells
      },
      getLines() {
        const lines = []
        for (let r = 0; r < rows; r++) {
          const y = posY(r)
          lines.push({ x1: 0, y1: y, x2: gridW, y2: y })
        }
        for (let c = 0; c < cols; c++) {
          const x = c * spacing
          if (riverAfterRow !== null) {
            lines.push({ x1: x, y1: 0, x2: x, y2: posY(riverAfterRow) })
            lines.push({ x1: x, y1: posY(riverAfterRow + 1), x2: x, y2: gridH })
          } else {
            lines.push({ x1: x, y1: 0, x2: x, y2: gridH })
          }
        }
        if (diagonals === 'full') {
          for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
              lines.push({ x1: c * spacing, y1: posY(r), x2: (c + 1) * spacing, y2: posY(r + 1) })
              lines.push({ x1: (c + 1) * spacing, y1: posY(r), x2: c * spacing, y2: posY(r + 1) })
            }
          }
        } else if (diagonals === 'alternating') {
          // One diagonal per square, not two. Drawing both in every other
          // square gives every point exactly two diagonals; an Alquerque board
          // alternates between points with four and points with none, which is
          // what the corner-to-corner and midpoint-to-midpoint lines produce.
          for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
              if ((r + c) % 2 === 0) {
                lines.push({ x1: c * spacing, y1: posY(r), x2: (c + 1) * spacing, y2: posY(r + 1) })
              } else {
                lines.push({ x1: (c + 1) * spacing, y1: posY(r), x2: c * spacing, y2: posY(r + 1) })
              }
            }
          }
        }
        for (const palace of palaces) {
          const { row, col, width: pw, height: ph } = palace
          const x1 = col * spacing, y1 = posY(row)
          const x2 = (col + pw) * spacing, y2 = posY(row + ph)
          lines.push({ x1, y1, x2, y2 })
          lines.push({ x1: x2, y1, x2: x1, y2 })
        }
        return lines
      },
      getAnnotations() {
        return starPoints.map(([r, c]) => ({
          element: 'circle',
          cellType: 'starpoint',
          attrs: { cx: c * spacing, cy: posY(r), r: 3 },
        }))
      },
      getLabels() {
        const labels = []
        const letterSkip = 'I'
        let letterIdx = 0
        for (let c = 0; c < cols; c++) {
          let ch = String.fromCharCode(65 + letterIdx)
          if (ch === letterSkip) { letterIdx++; ch = String.fromCharCode(65 + letterIdx) }
          labels.push({ x: c * spacing, y: gridH + 14, text: ch, anchor: 'middle' })
          letterIdx++
        }
        for (let r = 0; r < rows; r++) {
          labels.push({ x: -14, y: posY(r), text: String(rows - r), anchor: 'middle', baseline: 'central' })
        }
        return labels
      },
      defaults: {
        cells: { intersection: { fill: 'none', stroke: 'none', r: 0 } },
        lines: { stroke: '#3d2b1a', 'stroke-width': 0.8 },
        annotations: { starpoint: { fill: '#3d2b1a' } },
      },
    }
  }

  function serializePosition(cellStates, vocabulary) {
    const symbolMap = buildSymbolMap(vocabulary)
    const multiOwner = hasMultipleOwners(cellStates)

    if (multiOwner) {
      return serializeMultiChar(cellStates, symbolMap)
    }

    const rowStrings = []
    for (let r = 0; r < rows; r++) {
      let rowStr = ''
      let empty = 0
      for (let c = 0; c < cols; c++) {
        const idx = toIndex(r, c)
        const cell = cellStates[idx] || cellStates.get?.(idx) || null
        if (cell === null || cell === undefined) {
          empty++
        } else {
          if (empty > 0) { rowStr += String(empty); empty = 0 }
          // A symbol longer than one character is bracketed. A plugin
          // vocabulary may use multi-character codes when a variant has more
          // piece types than there are letters - Dai Shogi has 29 - and
          // written raw, `LN` reads back as an `L` and an `N`, so the row
          // parses to twice its width and the position is not the one served.
          const sym = symbolMap.toSymbol(cell)
          rowStr += String(sym).length > 1 ? `[${sym}]` : sym
        }
      }
      if (empty > 0) rowStr += String(empty)
      rowStrings.push(rowStr)
    }
    return rowStrings.join('/')
  }

  function hasMultipleOwners(cellStates) {
    for (let i = 0; i < rows * cols; i++) {
      const cell = cellStates[i] || cellStates.get?.(i) || null
      if (cell && typeof cell === 'object' && cell.owner > 1) return true
    }
    return false
  }

  function serializeMultiChar(cellStates, symbolMap) {
    const rowStrings = []
    for (let r = 0; r < rows; r++) {
      const tokens = []
      let empty = 0
      for (let c = 0; c < cols; c++) {
        const idx = toIndex(r, c)
        const cell = cellStates[idx] || cellStates.get?.(idx) || null
        if (cell === null || cell === undefined) {
          empty++
        } else {
          if (empty > 0) { tokens.push(String(empty)); empty = 0 }
          tokens.push(symbolMap.toSymbol(cell))
        }
      }
      if (empty > 0) tokens.push(String(empty))
      rowStrings.push(tokens.join(','))
    }
    return rowStrings.join('/')
  }

  function parsePosition(notation, vocabulary) {
    // A layered board is described one plane at a time - Alice Chess writes its
    // two boards as two FENs - so each is parsed into its own plane and laid
    // end to end. One FEN on a layered board fills the first plane and leaves
    // the rest empty, which is what a variant that starts everything on one
    // board wants.
    if (Array.isArray(notation)) {
      const all = new Array(layers * plane).fill(null)
      if (notation.length > layers) {
        throw new Error(`Setup has ${notation.length} planes but the topology declares ${layers} layers.`)
      }
      notation.forEach((text, layer) => {
        const one = parsePosition(text, vocabulary)
        const seats = layerSeats ? layerSeats[layer] : null
        for (let i = 0; i < plane; i++) {
          const cell = one[i]
          // Each board's two sides belong to that board's own seats.
          all[layer * plane + i] = cell && seats && typeof cell.owner === 'number' && seats[cell.owner] !== undefined
            ? { ...cell, owner: seats[cell.owner] }
            : cell
        }
      })
      return all
    }

    const symbolMap = buildSymbolMap(vocabulary)
    const cells = new Array(layers > 1 ? layers * plane : rows * cols).fill(null)
    const rowStrings = notation.split(' ')[0].split('/')
    const isCommaSeparated = rowStrings.some(r => r.includes(','))

    if (rowStrings.length !== rows && rowStrings[0] !== '') {
      throw new Error(`FEN has ${rowStrings.length} ranks but topology has ${rows} rows.`)
    }

    for (let r = 0; r < rowStrings.length && r < rows; r++) {
      let c = 0
      if (isCommaSeparated) {
        const tokens = rowStrings[r].split(',')
        for (const token of tokens) {
          const trimmed = token.trim()
          if (!trimmed) continue
          if (/^\d+$/.test(trimmed)) { c += parseInt(trimmed, 10) }
          else {
            const piece = symbolMap.fromSymbol(trimmed)
            if (!piece) throw new Error(`Unmapped FEN symbol "${trimmed}" at row ${r}, col ${c}. Declare it in vocabulary.`)
            if (c < cols) cells[toIndex(r, c)] = piece
            c++
          }
        }
        if (c > cols) throw new Error(`Rank ${r} has ${c} cells but topology has ${cols} columns.`)
      } else {
        const { cells: read, widths } = readPosition(rowStrings[r])
        for (const { col, symbol } of read) {
          const piece = symbolMap.fromSymbol(symbol)
          if (!piece) throw new Error(`Unmapped FEN symbol "${symbol}" at row ${r}, col ${col}. Declare it in vocabulary.`)
          if (col < cols) cells[toIndex(r, col)] = piece
        }
        c = widths[0] ?? 0
        if (c > cols) throw new Error(`Rank ${r} has ${c} cells but topology has ${cols} columns.`)
      }
    }
    return cells
  }

  function buildSymbolMap(vocabulary) {
    const toSym = new Map()
    const fromSym = new Map()
    const stringToSymbol = new Map()
    const symbolToString = new Map()

    if (!vocabulary) {
      return {
        toSymbol: (cell) => cell.symbol || '?',
        fromSymbol: (ch) => ({ symbol: ch }),
      }
    }

    for (const [type, def] of Object.entries(vocabulary)) {
      if (def.symbols && !def.symbols.count) {
        for (const [owner, symbol] of Object.entries(def.symbols)) {
          const ownerKey = /^\d+$/.test(owner) ? parseInt(owner, 10) : owner
          toSym.set(`${type}.${ownerKey}`, symbol)
          fromSym.set(symbol, { type, owner: ownerKey })
        }
        if (def.cellStrings) {
          for (let i = 0; i < def.cellStrings.length; i++) {
            const sym = def.symbols[String(i)]
            if (sym) {
              stringToSymbol.set(def.cellStrings[i], sym)
              symbolToString.set(sym, def.cellStrings[i])
            }
          }
        }
      }
    }

    return {
      toSymbol(cell) {
        if (typeof cell === 'string') {
          const mapped = stringToSymbol.get(cell)
          if (mapped) return mapped
          return cell
        }
        const key = `${cell.type}.${cell.owner}`
        const sym = toSym.get(key)
        if (sym) return sym
        return '?'
      },
      fromSymbol(ch) {
        const direct = fromSym.get(ch)
        if (direct) {
          const str = symbolToString.get(ch)
          if (str) return str
          return direct
        }
        return null
      },
    }
  }

  function getAllCells() {
    const result = []
    for (let i = 0; i < layers * plane; i++) {
      if (!isVoid(i % plane)) result.push(i)
    }
    return result
  }

  function getCellCount() {
    return (_voids ? plane - _voids.size : plane) * layers
  }

  function step(from, direction) {
    const dr = direction[0], dc = direction[1]
    const fromLayer = layerOf(from)
    const nl = targetLayer(fromLayer, direction[2])
    if (nl < 0) return null
    // Pawns are the only pieces that move by `step` rather than by rays or
    // leaps, so this was the one path still reading a raw index as a row. On
    // the second board of Alice Chess that put every pawn on rank nine and off
    // the edge, and pawns there could not move or be selected while every other
    // piece was fine.
    const local = from - fromLayer * plane
    const fr = (local / cols) | 0, fc = local % cols
    if (isDiagonal(dr, dc) && !diagonalExists(fr, fc)) return null
    if (spherical) {
      const [lr, lc] = poleLeap(fr, fc, dr, dc)
      const idx = nl * plane + toIndex(lr, lc)
      return isVoid(idx - nl * plane) ? null : idx
    }
    let nr = fr + dr, nc = fc + dc
    if (wrap) {
      const wrapped = wrapCoords(nr, nc)
      nr = wrapped[0]
      nc = wrapped[1]
    }
    if (!onBoard(nr, nc)) return null
    return nl * plane + toIndex(nr, nc)
  }

  function renderLayout(config = {}) {
    // A layered board draws one grid per layer, and the topology is the only
    // thing that knows how many there are.
    return renderGridLayout(rows, cols, layers > 1 ? { ...config, layers } : config)
  }

  return {
    rows,
    cols,
    layers,
    layerAdjacency,
    layerSeats,
    // Whether two rays from one cell can reach the same cell. Only across a
    // pole: every direction into it comes out at the same square.
    raysMayMeet: spherical,
    size: rows * cols,
    wrap,
    toIndex,
    toRC,
    wrapCoords,
    isValid,
    neighbours,
    diagonalNeighbours,
    allNeighbours,
    distance,
    chebyshev,
    toJSON,
    fromJSON,
    ray,
    rays,
    leapTargets,
    jumpPairs,
    adjacentPairs,
    onBoard,
    getDirections,
    getLayout,
    renderLayout,
    getAllCells,
    getCellCount,
    step,
    serializePosition,
    parsePosition,
    isBlocker,
  }
}

// ─── Grid render pipeline (#18) ─────────────────────────────────────────────


export function algebraicId(r, c, rows) {
  return fileLabel(c) + (rows - r)
}

export function algebraicToIndex(alg, rows, cols) {
  const parts = splitCellId(alg)
  if (!parts) return -1
  const c = fileIndex(parts.file)
  const r = rows - parts.rank
  return r * cols + c
}

export function indexToAlgebraic(idx, rows, cols) {
  const r = Math.floor(idx / cols)
  const c = idx % cols
  return algebraicId(r, c, rows)
}

export function intersectionId(r, c, rows) {
  return intersectionLabel(c) + (rows - r)
}

function idFn(idStyle) {
  if (typeof idStyle === 'function') return idStyle
  if (idStyle === 'intersection') return intersectionId
  return algebraicId
}

export function clusterCells(cells) {
  if (!cells.length) return []
  const key = (r, c) => `${r},${c}`
  const set = new Set(cells.map(([r, c]) => key(r, c)))
  const visited = new Set()
  const clusters = []
  for (const [r, c] of cells) {
    const k = key(r, c)
    if (visited.has(k)) continue
    const cluster = []
    const queue = [[r, c]]
    while (queue.length) {
      const [cr, cc] = queue.pop()
      const ck = key(cr, cc)
      if (visited.has(ck) || !set.has(ck)) continue
      visited.add(ck)
      cluster.push([cr, cc])
      queue.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1])
    }
    if (cluster.length) clusters.push(cluster)
  }
  return clusters
}

export function renderGridLayout(rows, cols, config = {}) {
  // Alice Chess is two boards and a piece may stand on the same square of each,
  // so one grid cannot show the position: they are drawn side by side. Each
  // layer is the same grid shifted right, and its cells carry the layer in
  // their id so a click lands on the board that was clicked.
  const layerCount = config.layers || 1
  if (layerCount > 1) {
    const single = { ...config }
    delete single.layers
    const first = renderGridLayout(rows, cols, single)
    const gap = (first.geom ? first.geom.tileSize : 56)
    const step = first.width + gap
    const merged = { ...first, elements: [...first.elements], cells: [...first.cells],
      labels: [...(first.labels || [])], width: first.width }
    for (let layer = 1; layer < layerCount; layer++) {
      const dx = step * layer
      const part = renderGridLayout(rows, cols, single)
      const shift = (el) => {
        const a = { ...el.attrs }
        if (a.x !== undefined) a.x = Number(a.x) + dx
        if (a.cx !== undefined) a.cx = Number(a.cx) + dx
        if (a.x1 !== undefined) a.x1 = Number(a.x1) + dx
        if (a.x2 !== undefined) a.x2 = Number(a.x2) + dx
        if (a.points) a.points = String(a.points).split(' ').map(pt => {
          const [px, py] = pt.split(',')
          return py === undefined ? pt : `${Number(px) + dx},${py}`
        }).join(' ')
        if (a['data-sq']) a['data-sq'] = `${a['data-sq']}-${layer + 1}`
        return { ...el, attrs: a }
      }
      merged.elements.push(...part.elements.map(shift))
      merged.labels.push(...(part.labels || []).map(shift))
      merged.cells.push(...part.cells.map(c => ({ ...c, id: `${c.id}-${layer + 1}`, x: c.x + dx })))
      merged.width = first.width + dx
    }
    return merged
  }

  const norm = config.ops ? config : normalizeLegacyConfig(rows, cols, config)
  const {
    tileSize = 56,
    positionType = 'square',
    ops = [],
  } = norm

  const isIntersection = positionType === 'intersection'
  const inset = norm.inset != null ? norm.inset : (isIntersection ? Math.round(tileSize * 0.5) : 0)
  const origin = norm.origin || { x: 0, y: 0 }

  const gridW = isIntersection ? (cols - 1) * tileSize : cols * tileSize
  const gridH = isIntersection ? (rows - 1) * tileSize : rows * tileSize
  const gx = origin.x + (isIntersection ? inset : 0)
  const gy = origin.y + (isIntersection ? inset : 0)
  const halfCell = isIntersection ? 0 : tileSize / 2

  const posX = (c) => gx + c * tileSize + halfCell
  const posY = (r) => gy + r * tileSize + halfCell

  const geom = { rows, cols, tileSize, isIntersection, inset, origin, gridW, gridH, gx, gy, posX, posY }

  const elements = []
  const cells = []

  for (const op of ops) {
    OP_HANDLERS[op.op](op, geom, elements, cells)
  }

  const boardW = gridW + (isIntersection ? inset * 2 : 0)
  const boardH = gridH + (isIntersection ? inset * 2 : 0)
  const width = norm.size ? norm.size.width : boardW + origin.x * 2
  const height = norm.size ? norm.size.height : boardH + origin.y * 2

  const labels = []
  if (norm.labels && norm.labels.show) {
    const lc = norm.labels
    const bottomY = origin.y + boardH + origin.y * 0.65
    const leftX = origin.x * 0.5
    for (let c = 0; c < cols; c++) {
      const text = lc.alphabet ? lc.alphabet[c] : fileLabel(c)
      labels.push({ tag: 'text', attrs: { x: posX(c), y: bottomY, 'text-anchor': 'middle', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }, text })
    }
    for (let r = 0; r < rows; r++) {
      const rowY = lc.offsetBaseline ? posY(r) + lc.fontSize * 0.35 : posY(r)
      const rowAttrs = { x: leftX, y: rowY, 'text-anchor': 'middle', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }
      if (!lc.offsetBaseline) rowAttrs['dominant-baseline'] = 'central'
      labels.push({ tag: 'text', attrs: rowAttrs, text: String(rows - r) })
    }
  }

  return { width, height, elements, cells, labels, tileSize, ox: gx, oy: gy }
}

const OP_HANDLERS = {

  rect(op, geom, elements) {
    elements.push({ tag: 'rect', attrs: op.attrs })
  },

  element(op, geom, elements) {
    elements.push({ tag: op.tag, attrs: op.attrs, text: op.text, children: op.children })
  },

  group(op, geom, elements) {
    if (op.skipEmpty && (!op.children || op.children.length === 0)) return
    elements.push({ tag: 'g', attrs: op.attrs, children: op.children })
  },

  cells(op, geom, elements, cells) {
    const { rows, cols, tileSize, origin } = geom
    const id = idFn(op.idStyle)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = op.fill(r, c)
        if (cell == null) continue
        const x = origin.x + c * tileSize
        const y = origin.y + r * tileSize
        const attrs = { x, y, width: tileSize, height: tileSize }
        if (typeof cell === 'string') {
          attrs.fill = cell
        } else {
          attrs.fill = cell.fill
          if (cell.stroke !== undefined) {
            attrs.stroke = cell.stroke
            attrs['stroke-width'] = cell.strokeWidth
          }
        }
        if (op.interactive) {
          attrs['data-sq'] = id(r, c, rows)
          if (typeof cell === 'object' && cell.type !== undefined) attrs['data-type'] = cell.type
          attrs.class = 'board-cell'
        }
        elements.push({ tag: 'rect', attrs })
        if (op.interactive) cells.push({ id: attrs['data-sq'], x: geom.posX(c), y: geom.posY(r) })
        if (op.decorations) {
          const decs = op.decorations(r, c, geom.posX(c), geom.posY(r), tileSize)
          if (decs) for (const d of decs) elements.push(d)
        }
      }
    }
  },

  'cell-decorations'(op, geom, elements) {
    const { rows, cols, tileSize } = geom
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const decs = op.fn(r, c, geom.posX(c), geom.posY(r), tileSize)
        if (decs) for (const d of decs) elements.push(d)
      }
    }
  },

  'zone-cells'(op, geom, elements) {
    const { tileSize, gx, gy } = geom
    for (const zone of op.zones) {
      if (!zone || !zone.cells || !zone.cells.length) continue
      const fill = zone.fill
      const opacity = zone.opacity
      for (const cluster of clusterCells(zone.cells)) {
        const rs = cluster.map(c => c[0])
        const cs = cluster.map(c => c[1])
        const minR = Math.min(...rs), maxR = Math.max(...rs)
        const minC = Math.min(...cs), maxC = Math.max(...cs)
        elements.push({ tag: 'rect', attrs: {
          x: gx + minC * tileSize,
          y: gy + minR * tileSize,
          width: Math.max((maxC - minC) * tileSize, tileSize),
          height: Math.max((maxR - minR) * tileSize, tileSize),
          fill, opacity,
        } })
      }
    }
  },

  'zone-ranges'(op, geom, elements) {
    const { rows, cols, tileSize, posX, posY } = geom
    for (const zone of op.zones) {
      elements.push({ tag: 'rect', attrs: {
        x: posX(zone.fromCol || 0),
        y: posY(zone.fromRow || 0),
        width: ((zone.toCol || cols - 1) - (zone.fromCol || 0)) * tileSize,
        height: ((zone.toRow || rows - 1) - (zone.fromRow || 0)) * tileSize,
        fill: zone.fill,
      } })
    }
  },

  'grid-lines'(op, geom, elements) {
    const { rows, cols, tileSize, isIntersection, gx, gy, gridW, gridH, posX, posY } = geom
    const stroke = op.color
    const width = op.width
    const grouped = op.grouped === true
    const out = grouped ? [] : elements
    const line = (x1, y1, x2, y2) => {
      const attrs = { x1, y1, x2, y2, 'pointer-events': 'none' }
      if (!grouped) { attrs.stroke = stroke; attrs['stroke-width'] = width }
      out.push({ tag: 'line', attrs })
    }

    const horizontals = () => {
      const skip = new Set(op.skipRows || [])
      const rMax = isIntersection ? rows : rows + 1
      for (let r = 0; r < rMax; r++) {
        if (skip.has(r)) continue
        const y = isIntersection ? posY(r) : gy + r * tileSize
        line(gx, y, gx + gridW, y)
      }
      for (const r of op.appendRows || []) {
        const y = isIntersection ? posY(r) : gy + r * tileSize
        line(gx, y, gx + gridW, y)
      }
    }

    const verticals = () => {
      const cMax = isIntersection ? cols : cols + 1
      for (let c = 0; c < cMax; c++) {
        const x = isIntersection ? posX(c) : gx + c * tileSize
        if (op.split && isIntersection) {
          const isEdge = op.split.edgeCols ? op.split.edgeCols.includes(c) : (c === 0 || c === cols - 1)
          if (isEdge) {
            line(x, gy, x, gy + gridH)
          } else {
            line(x, gy, x, posY(op.split.topRow))
            line(x, posY(op.split.bottomRow), x, gy + gridH)
          }
        } else {
          line(x, gy, x, gy + gridH)
        }
      }
    }

    if (op.order === 'vh') { verticals(); horizontals() } else { horizontals(); verticals() }

    if (grouped) {
      elements.push({ tag: 'g', attrs: { stroke, 'stroke-width': width }, children: out })
    }
  },

  diagonals(op, geom, elements) {
    const { rows, cols, posX, posY } = geom
    // The predicate is asked per direction, because a board can draw one
    // diagonal of a square and not the other - which is how an Alquerque board
    // gets points with four diagonals next to points with none.
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const x1 = posX(c), y1 = posY(r)
        const x2 = posX(c + 1), y2 = posY(r + 1)
        if (op.forward !== false && op.predicate(r, c, 'forward')) {
          elements.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: op.color, 'stroke-width': op.width } })
        }
        if (op.backward !== false && op.predicate(r, c, 'backward')) {
          elements.push({ tag: 'line', attrs: { x1: x2, y1, x2: x1, y2, stroke: op.color, 'stroke-width': op.width } })
        }
      }
    }
  },

  markers(op, geom, elements, cells) {
    const { rows, cols, posX, posY } = geom
    let items = op.items
    if (op.allCells) {
      items = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) items.push([r, c])
    }
    if (!items || items.length === 0) return

    const emit = (list) => {
      const id = op.hits ? idFn(op.hits.idStyle) : null
      for (const marker of items) {
        const [r, c] = Array.isArray(marker) ? marker : [marker.r, marker.c]
        const cx = posX(c), cy = posY(r)
        const attrs = { cx, cy, r: (Array.isArray(marker) ? undefined : marker.radius) || op.radius }
        if (op.itemFill !== undefined) attrs.fill = (Array.isArray(marker) ? undefined : marker.fill) || op.itemFill
        list.push({ tag: 'circle', attrs })
        if (op.hits) {
          const sq = id(r, c, rows)
          list.push({ tag: 'circle', attrs: { cx, cy, r: op.hits.radius, fill: 'transparent', class: 'board-cell', 'data-sq': sq } })
          cells.push({ id: sq, x: cx, y: cy })
        }
      }
    }

    if (op.grouped) {
      const children = []
      emit(children)
      elements.push({ tag: 'g', attrs: { fill: op.groupFill }, children })
    } else {
      emit(elements)
    }
  },

  texts(op, geom, elements) {
    for (const t of op.items) {
      elements.push({ tag: 'text', attrs: t.attrs, text: t.text })
    }
  },

  'hit-targets'(op, geom, elements, cells) {
    const { rows, cols, tileSize, origin, posX, posY } = geom
    const id = idFn(op.idStyle)
    const emitTo = op.emitTo || 'elements'
    const children = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = id(r, c, rows)
        const cx = posX(c), cy = posY(r)
        let element
        if (op.shape === 'rect') {
          element = { tag: 'rect', attrs: { x: origin.x + c * tileSize, y: origin.y + r * tileSize, width: tileSize, height: tileSize, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        } else if (op.grouped) {
          element = { tag: 'circle', attrs: { cx, cy, r: op.radius, class: 'board-cell', 'data-sq': sq, ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        } else {
          element = { tag: 'circle', attrs: { cx, cy, r: op.radius, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        }
        cells.push({ id: sq, x: cx, y: cy, element })
        if (emitTo !== 'cells') children.push(element)
      }
    }
    if (emitTo === 'cells') return
    if (op.grouped) {
      elements.push({ tag: 'g', attrs: { fill: 'transparent', 'pointer-events': 'all' }, children })
    } else {
      for (const el of children) elements.push(el)
    }
  },
}

function normalizeLegacyConfig(rows, cols, config) {
  const {
    tileSize = 56,
    colors = {},
    showLabels = true,
    inset = 0,
    backgrounds = [],
    lines: lineConfig = {},
    cellFill,
    diagonals,
    markers = [],
    zones = [],
    paths = [],
    texts = [],
    labels: labelConfig = {},
    positionType = 'square',
  } = config

  const isIntersection = positionType === 'intersection'
  const effInset = isIntersection ? (inset || Math.round(tileSize * 0.5)) : 0
  const pad = showLabels ? 24 : 0
  const gridW = isIntersection ? (cols - 1) * tileSize : cols * tileSize
  const gridH = isIntersection ? (rows - 1) * tileSize : rows * tileSize
  const boardW = gridW + effInset * 2
  const boardH = gridH + effInset * 2

  const ops = []

  for (const bg of backgrounds) {
    const attrs = { ...bg }
    if (attrs.x === undefined) attrs.x = pad
    if (attrs.y === undefined) attrs.y = pad
    if (attrs.width === undefined) attrs.width = boardW
    if (attrs.height === undefined) attrs.height = boardH
    ops.push({ op: 'rect', attrs })
  }

  if (cellFill) {
    ops.push({ op: 'cells', fill: (r, c) => {
      const fill = cellFill(r, c)
      if (fill === null) return null
      if (cellFill.stroke || cellFill.strokeWidth) {
        return { fill, stroke: cellFill.stroke ? cellFill.stroke(r, c) : undefined, strokeWidth: cellFill.strokeWidth ? cellFill.strokeWidth(r, c) : undefined }
      }
      return fill
    } })
  }

  if (config.cellDecorations) ops.push({ op: 'cell-decorations', fn: config.cellDecorations })

  if (zones.length) ops.push({ op: 'zone-ranges', zones })

  if (lineConfig.horizontal !== false) {
    const split = lineConfig.splitAfterRow != null
      ? { topRow: lineConfig.splitAfterRow, bottomRow: lineConfig.splitAfterRow + 1, edgeCols: lineConfig.edgeCols }
      : null
    ops.push({ op: 'grid-lines', color: lineConfig.color || colors.gridLine || '#333', width: lineConfig.width || 1.5, skipRows: lineConfig.skipRows, split, order: 'hv', grouped: false })
  }

  if (diagonals) {
    ops.push({ op: 'diagonals', predicate: diagonals.predicate, forward: diagonals.forward, backward: diagonals.backward, color: diagonals.color || lineConfig.color || colors.gridLine || '#333', width: diagonals.width || 1.5 })
  }

  for (const p of paths) {
    ops.push({ op: 'element', tag: 'path', attrs: { d: p.d, fill: p.fill || 'none', stroke: p.stroke, 'stroke-width': p.strokeWidth || 2.5, 'stroke-linecap': p.linecap || 'round' } })
  }

  if (markers.length) {
    ops.push({ op: 'markers', items: markers, radius: 3, itemFill: lineConfig.color || colors.gridLine || '#333' })
  }

  if (texts.length) {
    ops.push({ op: 'texts', items: texts.map(t => ({ attrs: { x: t.x, y: t.y, 'text-anchor': t.anchor || 'middle', 'dominant-baseline': t.baseline || 'central', 'font-size': t.fontSize, 'font-family': t.fontFamily || 'serif', fill: t.fill || '#333', ...(t.attrs || {}) }, text: t.text })) })
  }

  ops.push({ op: 'hit-targets', shape: isIntersection ? 'circle' : 'rect', radius: tileSize * 0.45, idStyle: labelConfig.alphabet ? (r, c, rws) => labelConfig.alphabet[c] + (rws - r) : 'algebraic', cellAttrs: config.cellAttrs })

  return {
    tileSize,
    positionType,
    inset: effInset,
    origin: { x: pad, y: pad },
    size: { width: boardW + pad * 2, height: boardH + pad * 2 },
    ops,
    labels: showLabels ? {
      show: true,
      color: labelConfig.color || colors.labelText || colors.gridLine || '#555',
      fontSize: labelConfig.fontSize || 10,
      fontFamily: labelConfig.fontFamily || 'monospace',
      alphabet: labelConfig.alphabet || null,
    } : null,
  }
}
