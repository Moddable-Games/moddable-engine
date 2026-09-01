import { readPosition, parseRankRuns, fileLabel, fileIndex, intersectionLabel, splitCellId } from '../../../core/index.js'
export const schema = {
  type: 'grid',
  required: ['rows', 'cols'],
}

export function createGridTopology(config) {
  const { rows, cols, wrap = false, voids: voidList, blockers: blockerList } = config

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
    if (wrapR && (wr < 0 || wr >= rows)) {
      wr = ((wr % rows) + rows) % rows
      if (wrap === 'mobius' || wrap === 'klein-bottle') wc = cols - 1 - wc
      if (wrap === 'spherical') wc = (wc + Math.floor(cols / 2)) % cols
    }
    return [wr, wc]
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

  function adjacentIn(dirs, r, c) {
    const result = []
    for (let i = 0; i < dirs.length; i++) {
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

  function ray(from, dr, dc, maxSteps) {
    // `toRC` allocates a pair for every call, and a slider asks for one ray per
    // direction per piece per node of the search.
    const isIdx = typeof from === 'number'
    const r = isIdx ? (from / cols) | 0 : from[0]
    const c = isIdx ? from % cols : from[1]
    const origin = toIndex(r, c)
    const result = []
    const limit = maxSteps || Math.max(rows, cols)
    let nr = r + dr, nc = c + dc
    let steps = 0
    while (steps < limit) {
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
      const idx = toIndex(nr, nc)
      if (idx === origin) break
      if (isVoid(idx)) break
      result.push(idx)
      nr += dr
      nc += dc
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
    return resolved.map(([dr, dc]) => ray(from, dr, dc, maxSteps))
  }

  function leapTargets(from, offsets) {
    const resolved = typeof offsets === 'string' ? getDirections(offsets) : offsets
    const r = (from / cols) | 0, c = from % cols
    const targets = []
    for (let i = 0; i < resolved.length; i++) {
      let nr = r + resolved[i][0], nc = c + resolved[i][1]
      if (wrap) {
        const wrapped = wrapCoords(nr, nc)
        nr = wrapped[0]
        nc = wrapped[1]
      }
      if (onBoard(nr, nc)) targets.push(toIndex(nr, nc))
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

  const DIRECTIONS = {
    orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
    diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    all: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
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
      diagonals = 'none',
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
          for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
              if ((r + c) % 2 === 0) {
                lines.push({ x1: c * spacing, y1: posY(r), x2: (c + 1) * spacing, y2: posY(r + 1) })
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
    const symbolMap = buildSymbolMap(vocabulary)
    const cells = new Array(rows * cols).fill(null)
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
    for (let i = 0; i < rows * cols; i++) {
      if (!isVoid(i)) result.push(i)
    }
    return result
  }

  function getCellCount() {
    return _voids ? rows * cols - _voids.size : rows * cols
  }

  function step(from, direction) {
    const dr = direction[0], dc = direction[1]
    let nr = ((from / cols) | 0) + dr, nc = (from % cols) + dc
    if (wrap) {
      const wrapped = wrapCoords(nr, nc)
      nr = wrapped[0]
      nc = wrapped[1]
    }
    if (!onBoard(nr, nc)) return null
    return toIndex(nr, nc)
  }

  function renderLayout(config = {}) {
    return renderGridLayout(rows, cols, config)
  }

  return {
    rows,
    cols,
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
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!op.predicate(r, c)) continue
        const x1 = posX(c), y1 = posY(r)
        const x2 = posX(c + 1), y2 = posY(r + 1)
        if (op.forward !== false) elements.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: op.color, 'stroke-width': op.width } })
        if (op.backward !== false) elements.push({ tag: 'line', attrs: { x1: x2, y1, x2: x1, y2, stroke: op.color, 'stroke-width': op.width } })
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
