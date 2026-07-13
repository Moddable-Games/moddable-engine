export const schema = {
  type: 'grid',
  required: ['rows', 'cols'],
  parseBoard(board) {
    const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
    if (!match) return null
    return { type: 'grid', rows: parseInt(match[1], 10), cols: parseInt(match[2], 10) }
  },
  matchBoard(board) {
    return /^\d+\s*[×x]\s*\d+$/.test(board)
  },
}

export function createGridTopology(config) {
  const { rows, cols, wrap = false } = config

  function toIndex(r, c) {
    return r * cols + c
  }

  function toRC(index) {
    return [Math.floor(index / cols), index % cols]
  }

  function wrapCoords(r, c) {
    if (!wrap) return [r, c]
    return [
      ((r % rows) + rows) % rows,
      ((c % cols) + cols) % cols,
    ]
  }

  function isValid(coord) {
    if (typeof coord === 'number') {
      return coord >= 0 && coord < rows * cols
    }
    const [r, c] = coord
    if (wrap) return true
    return r >= 0 && r < rows && c >= 0 && c < cols
  }

  function neighbours(coord) {
    const [r, c] = typeof coord === 'number' ? toRC(coord) : coord
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    const result = []
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        result.push(toIndex(nr, nc))
      }
    }
    return result
  }

  function diagonalNeighbours(coord) {
    const [r, c] = typeof coord === 'number' ? toRC(coord) : coord
    const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
    const result = []
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        result.push(toIndex(nr, nc))
      }
    }
    return result
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
    const [r, c] = typeof from === 'number' ? toRC(from) : from
    const result = []
    const limit = maxSteps || Math.max(rows, cols)
    let nr = r + dr, nc = c + dc
    let steps = 0
    while (steps < limit) {
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
      result.push(toIndex(nr, nc))
      nr += dr
      nc += dc
      steps++
    }
    return result
  }

  function onBoard(r, c) {
    if (wrap) return true
    return r >= 0 && r < rows && c >= 0 && c < cols
  }

  function rays(from, directions, maxSteps) {
    const resolved = typeof directions === 'string' ? getDirections(directions) : directions
    return resolved.map(([dr, dc]) => ray(from, dr, dc, maxSteps))
  }

  function leapTargets(from, offsets) {
    const resolved = typeof offsets === 'string' ? getDirections(offsets) : offsets
    const [r, c] = toRC(from)
    const targets = []
    for (const [dr, dc] of resolved) {
      let nr = r + dr, nc = c + dc
      if (wrap) [nr, nc] = wrapCoords(nr, nc)
      if (onBoard(nr, nc)) targets.push(toIndex(nr, nc))
    }
    return targets
  }

  function jumpPairs(from, directions) {
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
          labels.push({ x: c * tileSize + tileSize / 2, y: rows * tileSize + 12, text: String.fromCharCode(97 + c), anchor: 'middle' })
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
          rowStr += symbolMap.toSymbol(cell)
        }
      }
      if (empty > 0) rowStr += String(empty)
      rowStrings.push(rowStr)
    }
    return rowStrings.join('/')
  }

  function parsePosition(notation, vocabulary) {
    const symbolMap = buildSymbolMap(vocabulary)
    const cells = new Array(rows * cols).fill(null)
    const rowStrings = notation.split('/')
    for (let r = 0; r < rowStrings.length && r < rows; r++) {
      let c = 0
      for (const ch of rowStrings[r]) {
        if (ch >= '0' && ch <= '9') {
          c += parseInt(ch, 10)
        } else {
          const piece = symbolMap.fromSymbol(ch)
          if (piece && c < cols) {
            cells[toIndex(r, c)] = piece
          }
          c++
        }
      }
    }
    return cells
  }

  function buildSymbolMap(vocabulary) {
    const toSym = new Map()
    const fromSym = new Map()

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
      }
    }

    return {
      toSymbol(cell) {
        if (typeof cell === 'string') return cell
        const key = `${cell.type}.${cell.owner}`
        return toSym.get(key) || '?'
      },
      fromSymbol(ch) {
        return fromSym.get(ch) || null
      },
    }
  }

  function getAllCells() {
    const result = []
    for (let i = 0; i < rows * cols; i++) result.push(i)
    return result
  }

  function getCellCount() {
    return rows * cols
  }

  function step(from, direction) {
    const [dr, dc] = direction
    const [r, c] = toRC(from)
    let nr = r + dr, nc = c + dc
    if (wrap) [nr, nc] = wrapCoords(nr, nc)
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
  }
}

// ─── Grid render pipeline (#18) ─────────────────────────────────────────────

const GO_ALPHABET = 'abcdefghjklmnopqrst'

export function algebraicId(r, c, rows) {
  return String.fromCharCode(97 + c) + (rows - r)
}

export function goId(r, c, rows) {
  return GO_ALPHABET[c] + (rows - r)
}

function idFn(idStyle) {
  if (typeof idStyle === 'function') return idStyle
  if (idStyle === 'go') return goId
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
      const text = lc.alphabet ? lc.alphabet[c] : String.fromCharCode(97 + c)
      labels.push({ tag: 'text', attrs: { x: posX(c), y: bottomY, 'text-anchor': 'middle', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }, text })
    }
    for (let r = 0; r < rows; r++) {
      labels.push({ tag: 'text', attrs: { x: leftX, y: posY(r), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }, text: String(rows - r) })
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
      const attrs = { x1, y1, x2, y2 }
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
      elements.push({ tag: 'g', attrs: { fill: 'transparent' }, children })
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

  ops.push({ op: 'hit-targets', shape: isIntersection ? 'circle' : 'rect', radius: tileSize * 0.45, idStyle: labelConfig.alphabet ? (r, c, rws) => labelConfig.alphabet[c] + (rws - r) : 'algebraic', emitTo: 'cells', cellAttrs: config.cellAttrs })

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
