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
    return directions.map(([dr, dc]) => ray(from, dr, dc, maxSteps))
  }

  function leapTargets(from, offsets) {
    const [r, c] = toRC(from)
    const targets = []
    for (const [dr, dc] of offsets) {
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

  function getLayout(opts = {}) {
    const { tileSize = 56, alternating = true, colors = {} } = opts
    const lightFill = colors.light || '#f0d9b5'
    const darkFill = colors.dark || '#b58863'

    return {
      getDimensions() {
        return { width: cols * tileSize, height: rows * tileSize }
      },
      getCells() {
        const cells = []
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const fill = alternating ? ((r + c) % 2 === 0 ? lightFill : darkFill) : lightFill
            const x = c * tileSize
            const y = r * tileSize
            cells.push({
              key: toIndex(r, c),
              center: { x: x + tileSize / 2, y: y + tileSize / 2 },
              element: 'rect',
              attrs: { x, y, width: tileSize, height: tileSize, fill, stroke: 'none', 'stroke-width': 0.5 },
            })
          }
        }
        return cells
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
    getLayout,
  }
}
