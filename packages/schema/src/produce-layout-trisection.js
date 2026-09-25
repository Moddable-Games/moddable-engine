import { pieceImageKey } from './piece-symbols.js'
import { createTrisectionTopology, trisectionSize } from '../../topologies/trisection/index.js'

// The drawing program for a hexagonal-trisection board (engine#26), from
// resolved frontmatter. The geometry is the topology's - the same cells the
// game is played on, so a piece is drawn exactly where the rules put it -
// and this only decides how it looks.
//
// A chessboard is sized by `render.cellSize`, which on a board of equal
// squares is the width of a square. Here the squares are not equal: the
// quadrilaterals widen toward the centre, the smallest being the corners of
// each back rank. `cellSize` is the width of those, so a back rank is the
// width a chessboard's would be.
//
// Frontmatter fields read: topology.mode/layout/size (through the topology),
// render.cellSize, render.ops (the light and dark of a checkered cells op),
// surface colours cell-light, cell-dark, stroke and border, and at runtime
// render._position and render._pieceImages.

const PAD_CELLS = 0.6

function round(n) {
  return Math.round(n * 100) / 100
}

function colourScheme(colors, render) {
  const checkered = (render.ops || []).find(op => op.op === 'cells' && op.pattern === 'checkered')
  return {
    light: checkered?.light || colors['cell-light'] || '#f0d9b5',
    dark: checkered?.dark || colors['cell-dark'] || '#b58863',
    stroke: colors.stroke || '#5a4632',
    border: colors.border || colors.stroke || '#5a4632',
  }
}

// The largest square a piece can stand in: the distance between the midpoints
// of a cell's opposite edges, whichever pair is closer.
function standingRoom(points) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const [p0, p1, p2, p3] = points
  return Math.min(dist(mid(p0, p1), mid(p2, p3)), dist(mid(p1, p2), mid(p3, p0)))
}

export function produceTrisectionLayout(topo, colors, render) {
  // A point board with no declared size is one whose lines are not known, and
  // a picture of guessed lines would be read as the board.
  if (!trisectionSize(topo)) return null
  const board = createTrisectionTopology(topo)
  const geo = board.geometry()
  const size = board.size

  const cellSize = render.cellSize || 40
  // A back-rank corner cell is a quarter of half a side: 1 / (2 * size) of the
  // hexagon's circumradius.
  const R = cellSize * 2 * size
  const pad = cellSize * PAD_CELLS
  const width = round(2 * R + 2 * pad)
  const height = round(Math.sqrt(3) * R + 2 * pad)
  const cx = width / 2, cy = height / 2
  const at = (p) => ({ x: round(cx + p.x * R), y: round(cy - p.y * R) })
  const pts = (list) => list.map(p => { const q = at(p); return `${q.x},${q.y}` }).join(' ')

  const scheme = colourScheme(colors, render)
  const elements = []
  const hexagon = pts(geo.corners)

  const pieces = []
  const position = render._position || null
  const images = render._pieceImages || null

  if (board.mode === 'cells') {
    for (const cell of geo.cells) {
      elements.push({ tag: 'polygon', attrs: {
        points: pts(cell.points),
        fill: cell.colour === 0 ? scheme.dark : scheme.light,
        stroke: scheme.stroke,
        'stroke-width': 0.5,
        'data-sq': cell.key,
        class: 'board-cell',
      } })
      const piece = position && position[cell.key]
      const href = piece && images ? images[pieceImageKey(piece, images)] : null
      if (href) {
        const c = at(cell.centre)
        const s = round(standingRoom(cell.points.map(at)) * 0.92)
        pieces.push({ tag: 'image', attrs: { href, x: round(c.x - s / 2), y: round(c.y - s / 2), width: s, height: s } })
      }
    }
    // The seams between the three seats, over the cells so the sectors read.
    for (const [a, b] of geo.dividers) {
      const p = at(a), q = at(b)
      elements.push({ tag: 'line', attrs: { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: scheme.border, 'stroke-width': 2, 'pointer-events': 'none' } })
    }
  } else {
    elements.push({ tag: 'polygon', attrs: { points: hexagon, fill: scheme.light, stroke: 'none' } })
    for (const [a, b] of geo.segments) {
      const p = at(a), q = at(b)
      elements.push({ tag: 'line', attrs: { x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: scheme.stroke, 'stroke-width': 1.5 } })
    }
    const r = round(cellSize * 0.18)
    for (const point of geo.points) {
      const c = at(point.centre)
      elements.push({ tag: 'circle', attrs: { cx: c.x, cy: c.y, r, fill: scheme.stroke, 'data-sq': point.key, class: 'board-cell' } })
      const piece = position && position[point.key]
      const href = piece && images ? images[pieceImageKey(piece, images)] : null
      if (href) {
        const s = round(cellSize * 0.9)
        pieces.push({ tag: 'image', attrs: { href, x: round(c.x - s / 2), y: round(c.y - s / 2), width: s, height: s } })
      }
    }
  }

  elements.push({ tag: 'polygon', attrs: { points: hexagon, fill: 'none', stroke: scheme.border, 'stroke-width': 3, 'stroke-linejoin': 'round', 'pointer-events': 'none' } })
  if (pieces.length) elements.push({ tag: 'g', attrs: { 'pointer-events': 'none' }, children: pieces })

  return { type: 'hexagonal-trisection', config: { elements, width, height } }
}
