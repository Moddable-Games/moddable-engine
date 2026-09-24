// Move preview for the create page.
//
// Both previews (the piece definer's "what does this shape do" preview, and the
// hover preview over an already-placed piece) drive the real `fromConfig`
// primitive from packages/piece-behaviour over the real topology the board is
// made of. If the preview is wrong, the piece is wrong.
//
// This used to walk a rectangle of its own, "sufficient for the primitives this
// page can build". It could not see a void, a blocker or a wrapped edge, so it
// showed a rook sliding through a hole the game would stop it at, and it had no
// hex at all. The topology is built by the same registry a game uses.

import { fromConfig } from '../packages/piece-behaviour/index.js'
import { createTopology } from '../packages/play/index.js'
import { algebraicId } from '../packages/topologies/grid/index.js'

// The topology a game would build from this block, or null where the type has
// no provider.
export function previewTopology(topologyBlock) {
  try { return createTopology(topologyBlock) } catch { return null }
}

// Returns the move list, or null if the spec does not build.
export function movesForSpec(spec, { topology, from, board }) {
  if (!topology) return null
  let primitive
  try { primitive = fromConfig(spec) } catch { return null }
  try { return primitive.genMoves(topology, from, board) } catch { return null }
}

// The cell a preview starts from: the middle of the board.
export function centreCell(topology) {
  const cells = topology.getAllCells ? topology.getAllCells() : []
  if (topology.rows && topology.cols && topology.toIndex) {
    return topology.toIndex(Math.floor(topology.rows / 2), Math.floor(topology.cols / 2))
  }
  if (cells.includes('0,0')) return '0,0'
  return cells[Math.floor(cells.length / 2)]
}

// A placement key ("row,col" on a grid, the cell id elsewhere) as the cell the
// topology addresses.
export function cellForKey(topology, key) {
  if (topology.toIndex && /^\d+,\d+$/.test(key)) {
    const [r, c] = key.split(',').map(Number)
    return topology.toIndex(r, c)
  }
  return key
}

// The board a primitive reads: each occupied cell marked friendly or enemy to
// the piece being previewed. Indexed the way the topology indexes its cells.
export function boardFromPlacement(topology, placement, moverIsUpper) {
  const board = topology.toIndex ? new Array(topology.size || 0).fill(null) : {}
  for (const [key, symbol] of Object.entries(placement)) {
    const cell = cellForKey(topology, key)
    if (cell === undefined || cell === null) continue
    const isUpper = symbol === symbol.toUpperCase()
    board[cell] = { friendly: isUpper === moverIsUpper, enemy: isUpper !== moverIsUpper }
  }
  return board
}

// The `data-sq` a topology cell is drawn with.
function cellElement(container, topology, cell, idStyle) {
  if (!topology.toRC) return container.querySelector(`[data-sq="${cell}"]`)
  const [r, c] = topology.toRC(cell)
  const algebraic = algebraicId(r, c, topology.rows)
  return container.querySelector(`[data-sq="${idStyle === 'rc' ? `${r},${c}` : algebraic}"]`)
    || container.querySelector(`[data-sq="${r},${c}"]`)
    || container.querySelector(`[data-sq="${algebraic}"]`)
}

export function paintDots(container, cells, { topology, className, fill, radiusFactor = 0.15, idStyle }) {
  const svgEl = container.querySelector('svg')
  if (!svgEl || !topology) return 0
  let painted = 0
  for (const entry of cells) {
    const cell = typeof entry === 'object' && entry !== null ? entry.to : entry
    const el = cellElement(container, topology, cell, idStyle)
    if (!el || !el.getBBox) continue
    const rect = el.getBBox()
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
