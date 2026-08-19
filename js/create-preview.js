// Move preview for the create page.
//
// Both previews (the piece definer's "what does this shape do" preview, and the
// hover preview over an already-placed piece) drive the real `fromConfig`
// primitive from packages/piece-behaviour rather than a drawing of what the
// movement is supposed to look like. If the preview is wrong, the piece is
// wrong.
//
// The two used to carry their own copies of the direction and named-offset
// tables, which had already drifted apart: the hover copy accepted `camel`,
// the definer copy did not list `all` in the same order. One table now.

import { fromConfig } from '../packages/piece-behaviour/src/piece-definitions.js'
import { algebraicId } from '../packages/topologies/grid/src/topology-grid.js'

const DIRS = {
  orthogonal: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  diagonal: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  all: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
}

const NAMED_OFFSETS = {
  knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  elephant: [[-2, -2], [-2, 2], [2, -2], [2, 2]],
  camel: [[-3, -1], [-3, 1], [-1, -3], [-1, 3], [1, -3], [1, 3], [3, -1], [3, 1]],
  dabbaba: [[-2, 0], [2, 0], [0, -2], [0, 2]],
  zebra: [[-3, -2], [-3, 2], [-2, -3], [-2, 3], [2, -3], [2, 3], [3, -2], [3, 2]],
  king: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
}

// A minimal board-view of a rectangular grid, sufficient for the primitives
// this page can build. Not a replacement for topologies/grid: it exists so the
// preview does not need a live game instance.
function gridTopology(rows, cols) {
  return {
    rays(from, directions, maxSteps) {
      const resolved = typeof directions === 'string' ? (DIRS[directions] || []) : (directions || [])
      const fr = Math.floor(from / cols), fc = from % cols
      const limit = maxSteps || Math.max(rows, cols)
      return resolved.map(([dr, dc]) => {
        const ray = []
        for (let i = 1; i <= limit; i++) {
          const nr = fr + dr * i, nc = fc + dc * i
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) break
          ray.push(nr * cols + nc)
        }
        return ray
      })
    },
    leapTargets(from, offsets) {
      const resolved = typeof offsets === 'string' ? (NAMED_OFFSETS[offsets] || []) : (offsets || [])
      const fr = Math.floor(from / cols), fc = from % cols
      const out = []
      for (const [dr, dc] of resolved) {
        const nr = fr + dr, nc = fc + dc
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc)
      }
      return out
    },
  }
}

// Returns the move list, or null if the spec does not build. Exported without
// any DOM dependency so it can be tested.
export function movesForSpec(spec, { rows, cols, from, board }) {
  let primitive
  try { primitive = fromConfig(spec) } catch { return null }
  try { return primitive.genMoves(gridTopology(rows, cols), from, board) } catch { return null }
}

export function boardFromPlacement(placement, rows, cols, moverIsUpper) {
  const board = new Array(rows * cols).fill(null)
  for (const [key, fenChar] of Object.entries(placement)) {
    const [r, c] = key.split(',').map(Number)
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue
    const isUpper = fenChar === fenChar.toUpperCase()
    board[r * cols + c] = { friendly: isUpper === moverIsUpper, enemy: isUpper !== moverIsUpper }
  }
  return board
}

function cellSelector(container, r, c, rows, idStyle) {
  const algebraic = algebraicId(r, c, rows)
  return container.querySelector(`[data-sq="${idStyle === 'rc' ? `${r},${c}` : algebraic}"]`)
    || container.querySelector(`[data-sq="${r},${c}"]`)
    || container.querySelector(`[data-sq="${algebraic}"]`)
}

export function paintDots(container, cells, { rows, cols, className, fill, radiusFactor = 0.15, idStyle }) {
  const svgEl = container.querySelector('svg')
  if (!svgEl) return 0
  let painted = 0
  for (const entry of cells) {
    const idx = typeof entry === 'number' ? entry : entry.to
    const r = Math.floor(idx / cols), c = idx % cols
    const cell = cellSelector(container, r, c, rows, idStyle)
    if (!cell || !cell.getBBox) continue
    const rect = cell.getBBox()
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    dot.setAttribute('cx', rect.x + rect.width / 2)
    dot.setAttribute('cy', rect.y + rect.height / 2)
    dot.setAttribute('r', Math.min(rect.width, rect.height) * radiusFactor)
    dot.setAttribute('fill', typeof fill === 'function' ? fill(entry) : fill)
    dot.setAttribute('class', className)
    dot.setAttribute('pointer-events', 'none')
    svgEl.appendChild(dot)
    painted++
  }
  return painted
}
