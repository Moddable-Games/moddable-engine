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

    // Compute geometry
    const isIntersection = positionType === 'intersection'
    const gridW = isIntersection ? (cols - 1) * tileSize : cols * tileSize
    const gridH = isIntersection ? (rows - 1) * tileSize : rows * tileSize
    const effectiveInset = isIntersection ? (inset || Math.round(tileSize * 0.5)) : 0
    const pad = showLabels ? 24 : 0
    const boardW = gridW + effectiveInset * 2
    const boardH = gridH + effectiveInset * 2
    const ox = pad + effectiveInset
    const oy = pad + effectiveInset

    // Position mapping: row,col → pixel centre
    const halfCell = isIntersection ? 0 : tileSize / 2
    function posX(c) { return ox + c * tileSize + halfCell }
    function posY(r) { return oy + r * tileSize + halfCell }

    const elements = []

    // 1. Backgrounds — rects drawn in order (frame layers, surfaces)
    for (const bg of backgrounds) {
      const attrs = { ...bg }
      if (attrs.x === undefined) attrs.x = pad
      if (attrs.y === undefined) attrs.y = pad
      if (attrs.width === undefined) attrs.width = boardW
      if (attrs.height === undefined) attrs.height = boardH
      elements.push({ tag: 'rect', attrs })
    }

    // 2. Cell fills — one function determines each cell's fill from (r, c)
    if (cellFill) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const fill = cellFill(r, c)
          if (fill === null) continue
          const attrs = { x: pad + c * tileSize, y: pad + r * tileSize, width: tileSize, height: tileSize, fill }
          if (cellFill.stroke) attrs.stroke = cellFill.stroke(r, c)
          if (cellFill.strokeWidth) attrs['stroke-width'] = cellFill.strokeWidth(r, c)
          elements.push({ tag: 'rect', attrs })
        }
      }
    }

    // 2b. Cell decorations — extra elements drawn at cell centres
    if (config.cellDecorations) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const decs = config.cellDecorations(r, c, posX(c), posY(r), tileSize)
          if (decs) for (const d of decs) elements.push(d)
        }
      }
    }

    // 3. Zone highlights — tinted rects over row/col ranges
    for (const zone of zones) {
      const zx = posX(zone.fromCol || 0) - (isIntersection ? 0 : 0)
      const zy = posY(zone.fromRow || 0)
      const zw = ((zone.toCol || cols - 1) - (zone.fromCol || 0)) * tileSize
      const zh = ((zone.toRow || rows - 1) - (zone.fromRow || 0)) * tileSize
      elements.push({ tag: 'rect', attrs: { x: zx, y: zy, width: zw, height: zh, fill: zone.fill } })
    }

    // 4. Grid lines — built from lineConfig
    if (lineConfig.horizontal !== false) {
      const stroke = lineConfig.color || colors.gridLine || '#333'
      const strokeWidth = lineConfig.width || 1.5
      const skipRows = new Set(lineConfig.skipRows || [])
      const splitAfterRow = lineConfig.splitAfterRow
      const splitGap = lineConfig.splitGap || 0

      for (let r = 0; r < (isIntersection ? rows : rows + 1); r++) {
        if (skipRows.has(r)) continue
        const y = isIntersection ? posY(r) : pad + r * tileSize
        const x1 = isIntersection ? ox : pad
        const x2 = isIntersection ? ox + gridW : pad + gridW
        elements.push({ tag: 'line', attrs: { x1, y1: y, x2, y2: y, stroke, 'stroke-width': strokeWidth } })
      }

      for (let c = 0; c < (isIntersection ? cols : cols + 1); c++) {
        const x = isIntersection ? posX(c) : pad + c * tileSize
        if (splitAfterRow != null && isIntersection) {
          const isEdge = lineConfig.edgeCols ? lineConfig.edgeCols.includes(c) : (c === 0 || c === cols - 1)
          if (isEdge) {
            elements.push({ tag: 'line', attrs: { x1: x, y1: posY(0), x2: x, y2: posY(rows - 1), stroke, 'stroke-width': strokeWidth } })
          } else {
            elements.push({ tag: 'line', attrs: { x1: x, y1: posY(0), x2: x, y2: posY(splitAfterRow), stroke, 'stroke-width': strokeWidth } })
            elements.push({ tag: 'line', attrs: { x1: x, y1: posY(splitAfterRow + 1), x2: x, y2: posY(rows - 1), stroke, 'stroke-width': strokeWidth } })
          }
        } else {
          const y1 = isIntersection ? posY(0) : pad
          const y2 = isIntersection ? posY(rows - 1) : pad + gridH
          elements.push({ tag: 'line', attrs: { x1: x, y1, x2: x, y2, stroke, 'stroke-width': strokeWidth } })
        }
      }
    }

    // 5. Diagonal lines — determined by a predicate function
    if (diagonals) {
      const stroke = diagonals.color || lineConfig.color || colors.gridLine || '#333'
      const strokeWidth = diagonals.width || 1.5
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (!diagonals.predicate(r, c)) continue
          const x1 = posX(c), y1 = posY(r)
          const x2 = posX(c + 1), y2 = posY(r + 1)
          if (diagonals.forward !== false) {
            elements.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke, 'stroke-width': strokeWidth } })
          }
          if (diagonals.backward !== false) {
            elements.push({ tag: 'line', attrs: { x1: x2, y1, x2: x1, y2, stroke, 'stroke-width': strokeWidth } })
          }
        }
      }
    }

    // 6. Paths — SVG path elements (arcs, curves, custom shapes)
    for (const p of paths) {
      elements.push({ tag: 'path', attrs: { d: p.d, fill: p.fill || 'none', stroke: p.stroke, 'stroke-width': p.strokeWidth || 2.5, 'stroke-linecap': p.linecap || 'round' } })
    }

    // 7. Point markers — circles at specified positions
    for (const marker of markers) {
      const [r, c] = Array.isArray(marker) ? marker : [marker.r, marker.c]
      const cx = posX(c), cy = posY(r)
      const radius = marker.radius || 3
      const fill = marker.fill || lineConfig.color || colors.gridLine || '#333'
      elements.push({ tag: 'circle', attrs: { cx, cy, r: radius, fill } })
    }

    // 8. Texts — positioned text elements
    for (const t of texts) {
      elements.push({ tag: 'text', attrs: { x: t.x, y: t.y, 'text-anchor': t.anchor || 'middle', 'dominant-baseline': t.baseline || 'central', 'font-size': t.fontSize, 'font-family': t.fontFamily || 'serif', fill: t.fill || '#333', ...(t.attrs || {}) }, text: t.text })
    }

    // 9. Hit targets — one per playable position
    const cells = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = labelConfig.alphabet
          ? labelConfig.alphabet[c] + (rows - r)
          : String.fromCharCode(97 + c) + (rows - r)
        const cx = posX(c), cy = posY(r)
        const extra = config.cellAttrs ? config.cellAttrs(r, c) : {}
        const element = isIntersection
          ? { tag: 'circle', attrs: { cx, cy, r: tileSize * 0.45, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...extra } }
          : { tag: 'rect', attrs: { x: pad + c * tileSize, y: pad + r * tileSize, width: tileSize, height: tileSize, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...extra } }
        cells.push({ id: sq, x: cx, y: cy, element })
      }
    }

    // 10. Coordinate labels
    const labels = []
    if (showLabels) {
      const labelColor = labelConfig.color || colors.labelText || colors.gridLine || '#555'
      const fs = labelConfig.fontSize || 10
      const font = labelConfig.fontFamily || 'monospace'
      const alphabet = labelConfig.alphabet || null
      for (let c = 0; c < cols; c++) {
        const text = alphabet ? alphabet[c] : String.fromCharCode(97 + c)
        labels.push({ tag: 'text', attrs: { x: posX(c), y: posY(rows - 1) + effectiveInset + 14, 'text-anchor': 'middle', 'font-size': fs, fill: labelColor, 'font-family': font }, text })
      }
      for (let r = 0; r < rows; r++) {
        labels.push({ tag: 'text', attrs: { x: ox - effectiveInset - 4, y: posY(r), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: labelColor, 'font-family': font }, text: String(rows - r) })
      }
    }

    return { width: boardW + pad * 2, height: boardH + pad * 2, elements, cells, labels, tileSize, ox, oy }
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
