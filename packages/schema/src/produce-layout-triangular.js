import { pieceImageKey } from './piece-symbols.js'
import { createTriangularTopology } from '../../topologies/triangular/index.js'

// The drawing program for a board of triangles (engine#173), from resolved
// frontmatter. The cells are the topology's own, so a piece is drawn on the
// triangle the rules put it on. `render.cellSize` is the length of a side.
//
// Frontmatter fields read: topology.shape (through the topology),
// render.cellSize, render.labels, surface colours cell-light, stroke,
// label-text, and at runtime render._position and render._pieceImages.

function round(n) {
  return Math.round(n * 100) / 100
}

const FILE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'

export function produceTriangularLayout(topo, colors, render) {
  let board
  try { board = createTriangularTopology(topo) } catch { return null }
  const geo = board.geometry()

  const side = render.cellSize || 40
  const unit = side / 2
  const height = (side * Math.sqrt(3)) / 2
  const showLabels = render.labels !== false
  const pad = showLabels ? side * 0.6 : side * 0.2
  const width = round((geo.files + 1) * unit + 2 * pad)
  const tall = round(geo.ranks * height + 2 * pad)
  const at = (p) => ({ x: round(pad + p.x * unit), y: round(pad + (geo.ranks - p.y) * height) })

  const fill = colors['cell-light'] || '#e8c97a'
  const stroke = colors.stroke || '#4a3520'
  const elements = []
  const pieces = []
  const position = render._position || null
  const images = render._pieceImages || null

  for (const cell of geo.cells) {
    const pts = cell.points.map(at)
    elements.push({ tag: 'polygon', attrs: {
      points: pts.map(p => `${p.x},${p.y}`).join(' '),
      fill,
      stroke,
      'stroke-width': 1.25,
      'data-sq': cell.key,
      class: 'board-cell',
    } })
    const piece = position && position[cell.key]
    const href = piece && images ? images[pieceImageKey(piece, images)] : null
    if (href) {
      // Stood on the triangle's centroid, a third of the way up from its base.
      const cx = (pts[0].x + pts[1].x + pts[2].x) / 3
      const cy = (pts[0].y + pts[1].y + pts[2].y) / 3
      const s = round(side * 0.62)
      pieces.push({ tag: 'image', attrs: { href, x: round(cx - s / 2), y: round(cy - s / 2), width: s, height: s } })
    }
  }

  const labels = []
  if (showLabels) {
    const fontSize = round(Math.min(13, side * 0.3))
    const text = { 'text-anchor': 'middle', 'font-size': fontSize, 'font-family': 'monospace', fill: colors['label-text'] || '#5c3a1e', 'pointer-events': 'none' }
    // A file's cells sit on its middle, one half-side in from where it starts.
    for (let f = 0; f < geo.files; f++) {
      const x = round(pad + (f + 1) * unit)
      labels.push({ tag: 'text', attrs: { ...text, x, y: round(tall - pad * 0.3) }, text: FILE_LETTERS[f] })
    }
    for (let r = 1; r <= geo.ranks; r++) {
      const y = round(pad + (geo.ranks - r + 0.5) * height + fontSize * 0.35)
      labels.push({ tag: 'text', attrs: { ...text, x: round(pad * 0.45), y }, text: String(r) })
    }
  }

  if (pieces.length) elements.push({ tag: 'g', attrs: { 'pointer-events': 'none' }, children: pieces })
  return { type: 'triangular', config: { elements, width, height: tall, labels } }
}
