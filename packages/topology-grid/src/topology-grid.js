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
    const {
      tileSize = 56,
      mode = 'tiles',
      colors = {},
      showLabels = true,
      cellColor = 'uniform',
      cellMap,
      inset,
      decorations = [],
      markers = [],
    } = config

    if (mode === 'intersections') {
      return renderIntersections(config)
    }

    return renderTiles(config)
  }

  function renderTiles(config) {
    const {
      tileSize = 56,
      colors = {},
      showLabels = true,
      cellColor = 'uniform',
      cellMap,
    } = config

    const boardW = cols * tileSize
    const boardH = rows * tileSize
    const pad = showLabels ? 24 : 0
    const ox = pad
    const oy = pad
    const elements = []

    // Background fill
    if (cellColor === 'uniform') {
      elements.push({ tag: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, fill: colors.mono || '#d9b483' } })
    } else if (cellColor === 'checkered') {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const isLight = (r + c) % 2 === 0
          const fill = isLight ? (colors.light || '#f0d9b5') : (colors.dark || '#b58863')
          elements.push({ tag: 'rect', attrs: { x: ox + c * tileSize, y: oy + r * tileSize, width: tileSize, height: tileSize, fill } })
        }
      }
    } else if (cellColor === 'cellMap' && cellMap) {
      const mapRows = cellMap.split('\n')
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mapChar = mapRows[r]?.[c] || '.'
          const fill = colors.zoneColors?.[mapChar] || colors.light || '#f0d9b5'
          elements.push({ tag: 'rect', attrs: { x: ox + c * tileSize, y: oy + r * tileSize, width: tileSize, height: tileSize, fill } })
        }
      }
    }

    // Grid lines (uniform + cellMap modes)
    if (cellColor === 'uniform' || cellColor === 'cellMap') {
      const lineColor = colors.gridLine || colors.stroke || '#8b6914'
      for (let c = 0; c <= cols; c++) {
        const x = ox + c * tileSize
        elements.push({ tag: 'line', attrs: { x1: x, y1: oy, x2: x, y2: oy + boardH, stroke: lineColor, 'stroke-width': 1.5 } })
      }
      for (let r = 0; r <= rows; r++) {
        const y = oy + r * tileSize
        elements.push({ tag: 'line', attrs: { x1: ox, y1: y, x2: ox + boardW, y2: y, stroke: lineColor, 'stroke-width': 1.5 } })
      }
    }

    // Hit targets (transparent cells with position IDs)
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = String.fromCharCode(97 + c) + (rows - r)
        cells.push({
          id: sq,
          x: ox + c * tileSize + tileSize / 2,
          y: oy + r * tileSize + tileSize / 2,
          element: { tag: 'rect', attrs: { x: ox + c * tileSize, y: oy + r * tileSize, width: tileSize, height: tileSize, fill: 'transparent', 'data-sq': sq, class: 'board-cell' } },
        })
      }
    }

    // Labels
    const labels = []
    if (showLabels) {
      const labelColor = colors.labelText || colors.gridLine || '#8b6914'
      const fs = Math.min(13, pad * 0.55)
      for (let c = 0; c < cols; c++) {
        const x = ox + c * tileSize + tileSize / 2
        labels.push({ tag: 'text', attrs: { x, y: oy + boardH + pad * 0.65, 'text-anchor': 'middle', 'font-size': fs, fill: labelColor, 'font-family': 'monospace' }, text: String.fromCharCode(97 + c) })
      }
      for (let r = 0; r < rows; r++) {
        const y = oy + r * tileSize + tileSize / 2
        labels.push({ tag: 'text', attrs: { x: pad * 0.5, y: y + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: labelColor, 'font-family': 'monospace' }, text: String(rows - r) })
      }
    }

    return {
      width: boardW + pad * 2,
      height: boardH + pad * 2,
      elements,
      cells,
      labels,
      tileSize,
      ox,
      oy,
    }
  }

  function renderIntersections(config) {
    const {
      tileSize = 20,
      colors = {},
      showLabels = true,
      inset = 15,
      decorations = [],
      markers = [],
      riverAfterRow,
      riverHeight = 20,
      palaces = [],
      diagonals = 'none',
      labelStyle = 'algebraic',
    } = config

    const gap = riverAfterRow != null ? riverHeight : 0
    const gridW = (cols - 1) * tileSize
    const gridH = (rows - 1) * tileSize + gap
    const boardW = gridW + inset * 2
    const boardH = gridH + inset * 2
    const pad = showLabels ? 24 : 0
    const ox = pad + inset
    const oy = pad + inset
    const elements = []

    function posY(r) {
      if (riverAfterRow != null && r > riverAfterRow) return oy + r * tileSize + gap
      return oy + r * tileSize
    }

    // Board background (from config)
    if (colors.background) {
      elements.push({ tag: 'rect', attrs: { x: pad, y: pad, width: boardW, height: boardH, fill: colors.background } })
    }
    if (colors.surface) {
      elements.push({ tag: 'rect', attrs: { x: ox, y: oy, width: gridW, height: gridH, fill: colors.surface, rx: 2 } })
    }

    // Grid lines — horizontal
    const lineColor = colors.gridLine || '#3d2b1a'
    const lineWidth = colors.gridLineWidth || 0.8
    for (let r = 0; r < rows; r++) {
      const y = posY(r)
      elements.push({ tag: 'line', attrs: { x1: ox, y1: y, x2: ox + gridW, y2: y, stroke: lineColor, 'stroke-width': lineWidth } })
    }

    // Grid lines — vertical (split at river if present)
    for (let c = 0; c < cols; c++) {
      const x = ox + c * tileSize
      if (riverAfterRow != null) {
        elements.push({ tag: 'line', attrs: { x1: x, y1: oy, x2: x, y2: posY(riverAfterRow), stroke: lineColor, 'stroke-width': lineWidth } })
        elements.push({ tag: 'line', attrs: { x1: x, y1: posY(riverAfterRow + 1), x2: x, y2: posY(rows - 1), stroke: lineColor, 'stroke-width': lineWidth } })
      } else {
        elements.push({ tag: 'line', attrs: { x1: x, y1: oy, x2: x, y2: posY(rows - 1), stroke: lineColor, 'stroke-width': lineWidth } })
      }
    }

    // Diagonal decorations
    if (diagonals === 'full') {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          elements.push({ tag: 'line', attrs: { x1: ox + c * tileSize, y1: posY(r), x2: ox + (c + 1) * tileSize, y2: posY(r + 1), stroke: lineColor, 'stroke-width': lineWidth } })
          elements.push({ tag: 'line', attrs: { x1: ox + (c + 1) * tileSize, y1: posY(r), x2: ox + c * tileSize, y2: posY(r + 1), stroke: lineColor, 'stroke-width': lineWidth } })
        }
      }
    } else if (diagonals === 'alternating') {
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if ((r + c) % 2 === 0) {
            elements.push({ tag: 'line', attrs: { x1: ox + c * tileSize, y1: posY(r), x2: ox + (c + 1) * tileSize, y2: posY(r + 1), stroke: lineColor, 'stroke-width': lineWidth } })
            elements.push({ tag: 'line', attrs: { x1: ox + (c + 1) * tileSize, y1: posY(r), x2: ox + c * tileSize, y2: posY(r + 1), stroke: lineColor, 'stroke-width': lineWidth } })
          }
        }
      }
    }

    // Palace diagonals
    for (const palace of palaces) {
      const { row, col, width: pw, height: ph } = palace
      const dasharray = palace.dasharray || '4,3'
      const palaceWidth = palace.lineWidth || lineWidth
      const x1 = ox + col * tileSize, y1 = posY(row)
      const x2 = ox + (col + pw) * tileSize, y2 = posY(row + ph)
      elements.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: lineColor, 'stroke-width': palaceWidth, 'stroke-dasharray': dasharray } })
      elements.push({ tag: 'line', attrs: { x1: x2, y1, x2: x1, y2, stroke: lineColor, 'stroke-width': palaceWidth, 'stroke-dasharray': dasharray } })
    }

    // Star points / markers
    for (const marker of markers) {
      const [r, c] = marker
      const cx = ox + c * tileSize
      const cy = posY(r)
      elements.push({ tag: 'circle', attrs: { cx, cy, r: 3, fill: colors.markerFill || lineColor } })
    }

    // River text decorations
    for (const dec of decorations) {
      if (dec.type === 'river-text' && riverAfterRow != null) {
        const riverY1 = posY(riverAfterRow)
        const riverY2 = posY(riverAfterRow + 1)
        const midY = (riverY1 + riverY2) / 2
        const textColor = dec.color || colors.gridLine || lineColor
        const fontSize = dec.fontSize || tileSize * 0.9
        for (let i = 0; i < (dec.texts || []).length; i++) {
          const textX = ox + gridW * (dec.positions?.[i] || (i === 0 ? 0.25 : 0.75))
          elements.push({ tag: 'text', attrs: { x: textX, y: midY, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fontSize, 'font-family': dec.fontFamily || 'serif', fill: textColor, 'letter-spacing': '0.2em' }, text: dec.texts[i] })
        }
      }
    }

    // Hit targets (intersections as circles)
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sq
        if (labelStyle === 'go') {
          let letterIdx = c
          if (letterIdx >= 8) letterIdx++
          sq = String.fromCharCode(65 + letterIdx) + (rows - r)
        } else {
          sq = String.fromCharCode(97 + c) + (rows - r)
        }
        const cx = ox + c * tileSize
        const cy = posY(r)
        cells.push({
          id: sq,
          x: cx,
          y: cy,
          element: { tag: 'circle', attrs: { cx, cy, r: tileSize * 0.45, fill: 'transparent', 'data-sq': sq, class: 'board-cell' } },
        })
      }
    }

    // Labels
    const labels = []
    if (showLabels) {
      const labelColor = colors.labelText || lineColor
      const fs = 10
      if (labelStyle === 'go') {
        let letterIdx = 0
        for (let c = 0; c < cols; c++) {
          if (letterIdx === 8) letterIdx++
          labels.push({ tag: 'text', attrs: { x: ox + c * tileSize, y: posY(rows - 1) + 14 + inset, 'text-anchor': 'middle', 'font-size': fs, fill: labelColor, 'font-family': 'sans-serif' }, text: String.fromCharCode(65 + letterIdx) })
          letterIdx++
        }
      } else {
        for (let c = 0; c < cols; c++) {
          labels.push({ tag: 'text', attrs: { x: ox + c * tileSize, y: posY(rows - 1) + 14 + inset, 'text-anchor': 'middle', 'font-size': fs, fill: labelColor, 'font-family': 'monospace' }, text: String.fromCharCode(97 + c) })
        }
      }
      for (let r = 0; r < rows; r++) {
        labels.push({ tag: 'text', attrs: { x: ox - inset - 4, y: posY(r), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: labelColor, 'font-family': labelStyle === 'go' ? 'sans-serif' : 'monospace' }, text: String(rows - r) })
      }
    }

    return {
      width: boardW + pad * 2,
      height: boardH + pad * 2,
      elements,
      cells,
      labels,
      tileSize,
      ox,
      oy,
    }
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
