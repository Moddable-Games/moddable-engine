import { fileLabel } from '../../core/index.js'

// A grid whose files wrap, drawn as the rings its sources draw (engine#27).
//
// Circular Chess, Byzantine Chess and their relatives are played on a grid of
// rows by columns whose columns join round: the board data is a rectangle and
// the topology is a cylinder. Their sources draw it as concentric rings, and
// the rectangle is only ever a development of that. This is the same grid
// drawn the other way - rows as rings, columns as the spokes between them -
// with every cell keeping the id the flat grid gives it, so the pieces, the
// moves and the play page's clicks are exactly the flat board's.
//
// The corpus writes these boards ring by ring, "highest ring (4, outermost)
// first down to ring 1 (innermost)", the same rank-descending order as a FEN.
// So the first row is the outer ring and the last is the inner. Files run
// anticlockwise from the top, where the last file meets the first, which puts
// the middle of the files at the bottom: for a player seated there, file
// letters rise from left to right as they do on a chessboard.
//
// The inner ring's squares are made as wide as they are deep, which fixes the
// size of the hole in the middle; outer rings widen, as they do on a real
// board. `render.cellSize` is the depth of a ring.
//
// `render.rotation` turns the whole board clockwise, in degrees, for a board
// whose players are not seated at the top and bottom of that arrangement.

const TAU = Math.PI * 2

function round(n) {
  return Math.round(n * 100) / 100
}

export function produceAnnularLayout(topo, colors, render) {
  const rows = topo.rows || 8
  const cols = topo.cols || 8
  const depth = render.cellSize || 40
  const checkered = (render.ops || []).find(op => op.op === 'cells' && op.pattern === 'checkered')
  const light = colors[checkered?.light] || checkered?.light || colors['cell-light'] || '#f0d9b5'
  const dark = colors[checkered?.dark] || checkered?.dark || colors['cell-dark'] || '#b58863'
  const stroke = colors.stroke || '#5a4632'
  const showLabels = render.labels !== false

  // The inner ring's middle is where a square is exactly `depth` wide.
  const innerMid = (cols * depth) / TAU
  const hole = Math.max(depth * 0.5, innerMid - depth / 2)
  const outer = hole + rows * depth
  const margin = showLabels ? depth * 0.6 : depth * 0.15
  const size = round(2 * (outer + margin))
  const cx = size / 2, cy = size / 2
  const turn = ((render.rotation || 0) * Math.PI) / 180

  // Column c spans the angle from edge(c) to edge(c + 1), anticlockwise from
  // the top; SVG's y points down, so anticlockwise on screen subtracts.
  const edge = (c) => Math.PI / 2 + (c * TAU) / cols - turn
  const at = (radius, angle) => ({ x: round(cx + radius * Math.cos(angle)), y: round(cy - radius * Math.sin(angle)) })
  const radiusOf = (r) => outer - r * depth

  const elements = []
  const cells = []
  for (let r = 0; r < rows; r++) {
    const rOut = radiusOf(r), rIn = radiusOf(r + 1)
    for (let c = 0; c < cols; c++) {
      const a0 = edge(c), a1 = edge(c + 1)
      const p0 = at(rOut, a0), p1 = at(rOut, a1), p2 = at(rIn, a1), p3 = at(rIn, a0)
      // Anticlockwise on screen is a sweep of 0 on the outer arc, back along
      // the inner arc with a sweep of 1.
      const d = `M${p0.x},${p0.y} A${round(rOut)},${round(rOut)} 0 0 0 ${p1.x},${p1.y} L${p2.x},${p2.y} A${round(rIn)},${round(rIn)} 0 0 1 ${p3.x},${p3.y} Z`
      const id = `${fileLabel(c)}${rows - r}`
      const element = { tag: 'path', attrs: { d, fill: (r + c) % 2 === 0 ? light : dark, stroke, 'stroke-width': 0.75, 'data-sq': id, class: 'board-cell' } }
      elements.push(element)
      const mid = at((rOut + rIn) / 2, (a0 + a1) / 2)
      cells.push({ id, x: mid.x, y: mid.y })
    }
  }

  elements.push({ tag: 'circle', attrs: { cx, cy, r: round(outer), fill: 'none', stroke, 'stroke-width': 2, 'pointer-events': 'none' } })
  elements.push({ tag: 'circle', attrs: { cx, cy, r: round(hole), fill: 'none', stroke, 'stroke-width': 2, 'pointer-events': 'none' } })

  const labels = []
  if (showLabels) {
    const fontSize = round(Math.min(13, depth * 0.3))
    for (let c = 0; c < cols; c++) {
      const p = at(outer + margin * 0.5, (edge(c) + edge(c + 1)) / 2)
      labels.push({ tag: 'text', attrs: { x: p.x, y: round(p.y + fontSize * 0.35), 'text-anchor': 'middle', 'font-size': fontSize, 'font-family': 'monospace', fill: colors['label-text'] || '#5c3a1e', 'pointer-events': 'none' }, text: fileLabel(c) })
    }
  }

  return { type: 'annular', config: { width: size, height: size, elements, cells, labels } }
}
