// The six-pointed star of Stern-Halma as a board you can play on: its holes,
// which of them are neighbours, and where each lies on the triangular
// lattice, so a hop can be told to go straight.
//
// The renderer draws the same holes from `starRowWidths` and names its hit
// targets `h1..hN` in the same row-major order, so the two cannot disagree
// about which hole is which.

// Row hole counts for a six-pointed star of arm size n: n arm rows counting up,
// then 2n+1 body rows (central hexagon row + the two side arms), then n arm rows
// counting down. n = 4 gives the classic 121-hole board: arms of 1 to 4 holes,
// body rows narrowing from 13 to 9 and widening back to 13.
export function starRowWidths(n) {
  const widths = []
  for (let row = 0; row < n; row++) widths.push(row + 1)
  for (let m = 0; m <= 2 * n; m++) {
    const central = n + 1 + Math.min(m, 2 * n - m)
    const armWidth = m < n ? n - m : (m > n ? m - n : 0)
    widths.push(central + 2 * armWidth)
  }
  for (let row = 3 * n + 1; row <= 4 * n; row++) widths.push(4 * n + 1 - row)
  return widths
}

// Which arm a hole is in, or '' for the central hexagon.
export function starArmOf(armSize, row, i, width) {
  if (row < armSize) return 'N'
  if (row > 3 * armSize) return 'S'
  if (row <= 2 * armSize - 1) {
    const armWidth = armSize - (row - armSize)
    if (i < armWidth) return 'NW'
    if (i >= width - armWidth) return 'NE'
    return ''
  }
  if (row >= 2 * armSize + 1) {
    const armWidth = row - 2 * armSize
    if (i < armWidth) return 'SW'
    if (i >= width - armWidth) return 'SE'
  }
  return ''
}

// Holes as `{ name, x, y, arm }`. `y` is the row and `x` counts half-spacings
// from the centre line, so the six directions are (±2, 0) and (±1, ±1).
export function starStations(params = {}) {
  const armSize = params.armSize || 4
  const widths = starRowWidths(armSize)
  const nodes = []
  const at = new Map()
  widths.forEach((width, row) => {
    for (let i = 0; i < width; i++) {
      const node = { name: `h${nodes.length + 1}`, x: 2 * i - (width - 1), y: row, arm: starArmOf(armSize, row, i, width) }
      nodes.push(node)
      at.set(`${node.x},${node.y}`, node.name)
    }
  })
  const edges = []
  for (const node of nodes) {
    for (const [dx, dy] of [[2, 0], [1, 1], [-1, 1]]) {
      const other = at.get(`${node.x + dx},${node.y + dy}`)
      if (other) edges.push([node.name, other])
    }
  }
  return { nodes, edges }
}
